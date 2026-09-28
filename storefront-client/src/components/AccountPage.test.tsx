import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountPage } from "./AccountPage";
import { envelope, mockNetwork } from "../test/network";
import type { Customer } from "../types/account";

const mockCustomer: Customer = {
  id: "cust_123",
  email: "shopper@example.com",
  name: "Morgan Shopper",
  phone: "+1 (555) 123-4567",
  preferredStoreId: "store_1",
  marketingOptIn: true,
  role: "customer",
  status: "active",
};

const mockStores = [
  { id: "store_1", name: "Batavia Central", taxJurisdiction: "IL" },
  { id: "store_2", name: "Columbus East", taxJurisdiction: "OH" },
];

describe("AccountPage", () => {
  beforeEach(() => {
    mockNetwork({
      "GET /api/customers/me/addresses": () =>
        envelope([
          {
            id: "addr_1",
            customerId: "cust_123",
            kind: "shipping",
            recipient: "Morgan Shopper",
            line1: "100 Main St",
            line2: null,
            city: "Batavia",
            region: "IL",
            postalCode: "60510",
            country: "US",
            isDefault: true,
          },
        ]),
      "PATCH /api/customers/me": (call) =>
        envelope({
          ...mockCustomer,
          ...(call.body as Record<string, unknown>),
        }),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders profile tab and allows updating name", async () => {
    const user = userEvent.setup();
    const onProfileUpdated = vi.fn();

    render(
      <AccountPage
        token="tok_123"
        customer={mockCustomer}
        stores={mockStores}
        onProfileUpdated={onProfileUpdated}
        onSignOut={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "My Account" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Morgan Shopper")).toBeInTheDocument();

    const nameInput = screen.getByLabelText("Full Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Morgan Updated");

    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Profile updated successfully.");
    });
    expect(onProfileUpdated).toHaveBeenCalled();
  });

  it("switches to Address Book tab and displays saved addresses", async () => {
    const user = userEvent.setup();

    render(
      <AccountPage
        token="tok_123"
        customer={mockCustomer}
        stores={mockStores}
        onSignOut={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Address Book" }));

    await waitFor(() => {
      expect(screen.getByText("100 Main St")).toBeInTheDocument();
    });
    expect(screen.getByText("Default shipping")).toBeInTheDocument();
  });

  it("switches to Privacy tab and displays data download and delete buttons", async () => {
    const user = userEvent.setup();

    render(
      <AccountPage
        token="tok_123"
        customer={mockCustomer}
        stores={mockStores}
        onSignOut={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Privacy & Settings" }));

    expect(screen.getByRole("heading", { name: "Download Personal Data" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download My Data" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Permanently Close My Account" })).toBeInTheDocument();
  });
});
