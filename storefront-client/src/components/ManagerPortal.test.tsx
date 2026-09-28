import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { envelope, mockNetwork } from "../test/network";
import type { Customer } from "../types/account";
import type { StoreInventoryRecord } from "../types/receiving";
import type { StoreLocation } from "../types/store";
import { ManagerPortal } from "./ManagerPortal";

const managerUser: Customer = {
  id: "cus-mgr-1",
  email: "manager@example.com",
  name: "Marcus Store Manager",
  phone: "555-0100",
  preferredStoreId: "IL-01",
  marketingOptIn: false,
  role: "store-manager",
  status: "active",
};

const customerUser: Customer = {
  id: "cus-regular-1",
  email: "customer@example.com",
  name: "Jane Customer",
  phone: "555-0200",
  preferredStoreId: "IL-01",
  marketingOptIn: false,
  role: "customer",
  status: "active",
};

const mockStores: StoreLocation[] = [
  { id: "IL-01", name: "Lincoln Park Superstore", taxJurisdiction: "IL" },
  { id: "OH-01", name: "Short North Express", taxJurisdiction: "OH" },
];

const mockInventory: StoreInventoryRecord[] = [
  {
    storeId: "IL-01",
    productId: "p-00001",
    productName: "Organic Whole Milk 1 Gallon",
    brand: "Horizon Organic",
    department: "dairy",
    stock: 45,
    reserved: 5,
    available: 40,
    unitCostMinor: 280,
    lowStockThreshold: 10,
    isLowStock: false,
    updatedAt: "2026-09-20T10:00:00Z",
  },
  {
    storeId: "IL-01",
    productId: "p-00002",
    productName: "Artisan Sourdough Loaf",
    brand: "Bakehouse",
    department: "bakery",
    stock: 8,
    reserved: 2,
    available: 6,
    unitCostMinor: 150,
    lowStockThreshold: 10,
    isLowStock: true,
    updatedAt: "2026-09-20T10:00:00Z",
  },
];

afterEach(() => vi.restoreAllMocks());

describe("ManagerPortal", () => {
  it("blocks non-managers from accessing portal with an access restricted banner", () => {
    mockNetwork({});
    render(<ManagerPortal token="token-1" customer={customerUser} stores={mockStores} />);

    expect(screen.getByText("Access Restricted")).toBeInTheDocument();
    expect(screen.getByText(/reserved for Store Managers and Administrators/)).toBeInTheDocument();
  });

  it("renders store inventory table, low-stock warnings, and WAC cost for store manager", async () => {
    mockNetwork({
      "GET /manager/stores/IL-01/inventory": () => envelope({ inventory: mockInventory }),
    });

    render(<ManagerPortal token="token-mgr" customer={managerUser} stores={mockStores} />);

    expect(screen.getByRole("heading", { name: /Store Manager & Goods Receiving/i })).toBeInTheDocument();
    expect(await screen.findByText("Organic Whole Milk 1 Gallon")).toBeInTheDocument();
    expect(screen.getByText("Artisan Sourdough Loaf")).toBeInTheDocument();
    expect(screen.getByText("⚠️ Low Stock (≤10)")).toBeInTheDocument();
    expect(screen.getByText("$2.80")).toBeInTheDocument();
  });

  it("creates a Goods Receipt Note (GRN) manually and displays confirmation message", async () => {
    const network = mockNetwork({
      "GET /manager/stores/IL-01/inventory": () => envelope({ inventory: mockInventory }),
      "POST /manager/grn": (call) => {
        expect(call.body).toMatchObject({
          storeId: "IL-01",
          supplier: "Valley Dairy Farms",
          poReference: "PO-2026-TEST",
        });
        return envelope(
          {
            grn: {
              id: "grn-99",
              grnNumber: "GRN-IL01-0099",
              storeId: "IL-01",
              supplier: "Valley Dairy Farms",
              poReference: "PO-2026-TEST",
              status: "received",
              totalCostMinor: 2500,
              receivedBy: "Marcus Store Manager",
              receivedAt: "2026-09-20T12:00:00Z",
              items: [],
            },
          },
          201
        );
      },
    });

    render(<ManagerPortal token="token-mgr" customer={managerUser} stores={mockStores} />);

    // Wait for inventory to be populated
    expect(await screen.findByText("Organic Whole Milk 1 Gallon")).toBeInTheDocument();

    // Switch to GRN tab
    fireEvent.click(screen.getByRole("button", { name: /Goods Receipt \(GRN\)/i }));

    expect(screen.getByRole("heading", { name: /Create Manual Goods Receipt Note/i })).toBeInTheDocument();

    // Fill supplier
    fireEvent.change(screen.getByLabelText(/Vendor \/ Supplier Name \*/i), { target: { value: "Valley Dairy Farms" } });
    fireEvent.change(screen.getByLabelText(/Purchase Order \(PO\) Reference \*/i), { target: { value: "PO-2026-TEST" } });

    // Select product in line item
    const productSelect = screen.getByLabelText(/Product SKU for item 1/i);
    fireEvent.change(productSelect, { target: { value: "p-00001" } });

    // Submit form
    const form = screen.getByRole("heading", { name: /Create Manual Goods Receipt Note/i }).closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/Successfully generated Goods Receipt Note #GRN-IL01-0099/i)).toBeInTheDocument();
    });

    expect(network.callsTo("/manager/grn")).toHaveLength(1);
  });

  it("processes inter-store stock transfers between retail locations", async () => {
    const network = mockNetwork({
      "GET /manager/stores/IL-01/inventory": () => envelope({ inventory: mockInventory }),
      "POST /manager/transfers": () =>
        envelope(
          {
            transfer: {
              id: "trf-1",
              transferNumber: "TRF-982110",
              fromStoreId: "IL-01",
              toStoreId: "OH-01",
              productId: "p-00001",
              quantity: 5,
              status: "completed",
              createdAt: "2026-09-20T12:00:00Z",
            },
          },
          201
        ),
    });

    render(<ManagerPortal token="token-mgr" customer={managerUser} stores={mockStores} />);

    // Wait for inventory to be populated
    expect(await screen.findByText("Organic Whole Milk 1 Gallon")).toBeInTheDocument();

    // Switch to transfers tab
    fireEvent.click(screen.getByRole("button", { name: /Stock Transfer/i }));

    expect(screen.getByRole("heading", { name: /Inter-Store Stock Transfer/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Destination Store \*/i), { target: { value: "OH-01" } });
    fireEvent.change(screen.getByLabelText(/Product \/ SKU to Transfer \*/i), { target: { value: "p-00001" } });
    fireEvent.change(screen.getByLabelText(/Quantity to Transfer \*/i), { target: { value: "5" } });

    const form = screen.getByRole("heading", { name: /Inter-Store Stock Transfer/i }).closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/Transferred 5 unit\(s\) successfully! Transfer ref: TRF-982110/i)).toBeInTheDocument();
    });

    expect(network.callsTo("/manager/transfers")).toHaveLength(1);
  });
});
