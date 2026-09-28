import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SetupWizard } from "./SetupWizard";
import { envelope, failure, mockNetwork } from "../test/network";

describe("SetupWizard", () => {
  beforeEach(() => {
    mockNetwork({
      "GET /api/setup/options": () =>
        envelope([
          {
            code: "US",
            displayName: "United States (US)",
            defaults: {
              currency: "USD",
              locale: "en-US",
              priceMode: "tax-exclusive",
              units: "imperial",
              taxProvider: "us-tax-table",
              payments: ["payment-simulator-card", "pay-at-pickup"],
              receipt: "us-retail-html",
            },
            taxProviders: [{ id: "us-tax-table", displayName: "US Tax Engine" }],
            paymentMethods: [
              { id: "payment-simulator-card", displayName: "Simulated Credit Card", kind: "card", simulated: true },
              { id: "pay-at-pickup", displayName: "Pay at Pickup", kind: "offline", simulated: false },
            ],
            receiptTemplates: [{ id: "us-retail-html", displayName: "US Retail Receipt" }],
            jurisdictions: [
              { id: "IL", displayName: "Illinois (IL)" },
              { id: "OH", displayName: "Ohio (OH)" },
              { id: "PA", displayName: "Pennsylvania (PA)" },
            ],
          },
        ]),
      "POST /api/setup/install": (call) => {
        const token = call.headers["x-setup-token"];
        if (token !== "valid-token") {
          return failure(401, { error: "INVALID_SETUP_TOKEN", message: "Missing or invalid x-setup-token header" });
        }
        return envelope({
          region: "US",
          currency: "USD",
          locale: "en-US",
          priceMode: "tax-exclusive",
          units: "imperial",
          taxProvider: "us-tax-table",
          paymentMethods: [
            { id: "payment-simulator-card", displayName: "Simulated Credit Card", kind: "card", simulated: true },
          ],
          paymentSimulation: true,
          receipt: "us-retail-html",
          stores: [
            { id: "store_1", name: "Batavia Central", taxJurisdiction: "IL" },
          ],
          installedAt: new Date().toISOString(),
        }, 201);
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("loads setup options and renders the wizard form", async () => {
    render(<SetupWizard onInstalled={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Store Setup Wizard" })).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/One-Time Setup Token/i)).toBeInTheDocument();
    expect(screen.getByText(/simulated test providers/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Batavia Central")).toBeInTheDocument();
    expect(screen.getByDisplayValue("admin@example.com")).toBeInTheDocument();
  });

  it("submits the setup installation when valid setup token is entered", async () => {
    const user = userEvent.setup();
    const onInstalled = vi.fn();

    render(<SetupWizard onInstalled={onInstalled} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/One-Time Setup Token/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/One-Time Setup Token/i), "valid-token");
    await user.click(screen.getByRole("button", { name: "Complete Store Setup" }));

    await waitFor(() => {
      expect(onInstalled).toHaveBeenCalled();
    });
  });

  it("shows error when token is invalid", async () => {
    const user = userEvent.setup();

    render(<SetupWizard onInstalled={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/One-Time Setup Token/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/One-Time Setup Token/i), "wrong-token");
    await user.click(screen.getByRole("button", { name: "Complete Store Setup" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Missing or invalid x-setup-token header");
    });
  });
});
