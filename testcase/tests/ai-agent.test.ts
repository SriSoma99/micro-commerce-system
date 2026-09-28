import request from "supertest";
import { createApp } from "../../product-catalog-service/src/app";

describe("Conversational AI, RAG & Agentic Copilots (WS N / AI-01..07)", () => {
  let app: ReturnType<typeof createApp>;
  let customerToken: string;
  let managerToken: string;
  let financeToken: string;

  beforeAll(async () => {
    process.env.DATABASE_PATH = ":memory:";
    process.env.SEED_SYNTHETIC_DATA = "true";
    app = createApp();

    // Login customer
    const custRes = await request(app).post("/api/auth/login").send({
      email: "demo@example.com",
      password: "Demo@1234"
    });
    customerToken = custRes.body.data.token;

    // Login Store Manager
    const mgrRes = await request(app).post("/api/auth/login").send({
      email: "manager@example.com",
      password: "Demo@1234"
    });
    managerToken = mgrRes.body.data.token;

    // Login Finance Officer
    const finRes = await request(app).post("/api/auth/login").send({
      email: "finance@example.com",
      password: "Demo@1234"
    });
    financeToken = finRes.body.data.token;
  });

  it("TC-950: Shopper assistant executes natural language search with dietary filters (AI-01)", async () => {
    const res = await request(app)
      .post("/api/ai/chat")
      .send({
        persona: "shopper",
        message: "I need eggs vegan fed",
        storeId: "OH-01"
      });

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.response).toBeDefined();
    expect(data.conversationId).toBeDefined();
    expect(data.response).toMatch(/egg/i);
    expect(data.toolCalls).toBeDefined();
    expect(data.toolCalls[0].name).toBe("search_catalog_ai");
  });

  it("TC-951: Store Manager and Finance Copilot answers exact date sales & AOV (AI-02)", async () => {
    const res = await request(app)
      .post("/api/ai/chat")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        persona: "store_manager",
        message: "What is average sale on 10-Sep-2026?",
        storeId: "IL-01"
      });

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.response).toBeDefined();
    expect(data.response).toMatch(/September 10, 2026|2026-09-10/);
    expect(data.response).toMatch(/Average Sale|Average Order Value/);
    expect(data.toolCalls).toBeDefined();
    expect(data.toolCalls[0].name).toBe("get_store_sales_analytics");
  });

  it("TC-952: Policy RAG retrieves grounded perishable freshness guidelines (AI-03)", async () => {
    const res = await request(app)
      .post("/api/ai/chat")
      .send({
        persona: "support_desk",
        message: "What is the return policy for moldy berries?"
      });

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.response).toMatch(/perishable|freshness|refund/i);
  });

  it("TC-953: Autonomous customer service agent instantly auto-refunds damaged perishable <= $25 (AI-04, AI-05)", async () => {
    const res = await request(app)
      .post("/api/ai/chat")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        persona: "support_desk",
        message: "My organic berries in order ORD-9842 were squished and moldy, can I get a refund of $5.30?"
      });

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.response).toMatch(/Refund Automatically Approved|Credit Receipt Reference/i);
    expect(data.toolCalls[0].result.status).toBe("auto_approved");
    expect(data.toolCalls[0].result.amountMinor).toBe(530);
  });

  it("TC-954: Agent flags high-value claim > $25 and creates supervisor approval draft (AI-05)", async () => {
    const res = await request(app)
      .post("/api/ai/chat")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        persona: "support_desk",
        message: "My bulk meat order ORD-5541 was spoiled, I need a refund of $48.50"
      });

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.response).toMatch(/Supervisor Approval Required|Action Approval Draft/i);
    expect(data.toolCalls[0].result.status).toBe("draft_created");
    expect(data.draftCreated).toBeDefined();
    expect(data.draftCreated.id).toMatch(/^draft_/);
  });

  it("TC-955: Store Manager or Admin reviews and approves pending action draft (AI-05)", async () => {
    // 1. List pending drafts as manager
    const listRes = await request(app)
      .get("/api/ai/drafts?status=pending")
      .set("Authorization", `Bearer ${managerToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.drafts.length).toBeGreaterThan(0);
    const targetDraftId = listRes.body.data.drafts[0].id;

    // 2. Approve draft
    const approveRes = await request(app)
      .post(`/api/ai/drafts/${targetDraftId}/approve`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe("approved");
  });

  it("TC-956: Regular customer is forbidden from accessing supervisor action drafts (AI-06)", async () => {
    const listRes = await request(app)
      .get("/api/ai/drafts")
      .set("Authorization", `Bearer ${customerToken}`);

    expect(listRes.status).toBe(403);
  });

  it("TC-957: Finance officer queries enterprise sales and metrics via AI (ACC, AI-02)", async () => {
    const res = await request(app)
      .post("/api/ai/chat")
      .set("Authorization", `Bearer ${financeToken}`)
      .send({
        persona: "store_manager",
        message: "What were total network sales on 10-Sep-2026?"
      });

    expect(res.status).toBe(200);
    expect(res.body.data.response).toMatch(/Enterprise Financial Report|Gross Revenue/i);
  });

  it("TC-958: AI & RAG telemetry dashboard metrics are available (AI-06, OBS)", async () => {
    const metricsRes = await request(app).get("/api/ai/metrics");

    expect(metricsRes.status).toBe(200);
    const data = metricsRes.body.data;
    expect(data.faithfulnessScore).toBeGreaterThanOrEqual(0.9);
    expect(data.contextPrecision).toBeGreaterThanOrEqual(0.9);
    expect(data.toolInvocations).toBeDefined();
    expect(data.autoApprovedActionsCount).toBeGreaterThan(0);
  });
});
