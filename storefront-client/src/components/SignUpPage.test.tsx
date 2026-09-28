import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignUpPage } from "./SignUpPage";

describe("SignUpPage", () => {
  afterEach(cleanup);

  it("renders the sign-up form with name, email, password, and confirm-password", () => {
    render(<SignUpPage onRegister={vi.fn()} onSuccess={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Create an account" })).toBeInTheDocument();
    expect(screen.getByLabelText("Full Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email Address")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password$/)).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
  });

  it("validates that password and confirm password match", async () => {
    const user = userEvent.setup();
    const register = vi.fn();
    render(<SignUpPage onRegister={register} onSuccess={vi.fn()} />);

    await user.type(screen.getByLabelText("Full Name"), "Alex Doe");
    await user.type(screen.getByLabelText("Email Address"), "alex@example.com");
    await user.type(screen.getByLabelText(/^Password$/), "Password123");
    await user.type(screen.getByLabelText("Confirm Password"), "DifferentPassword");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Passwords do not match.");
    expect(register).not.toHaveBeenCalled();
  });

  it("submits the form and calls onSuccess when registration succeeds", async () => {
    const user = userEvent.setup();
    const register = vi.fn().mockResolvedValue(null);
    const success = vi.fn();
    render(<SignUpPage onRegister={register} onSuccess={success} />);

    await user.type(screen.getByLabelText("Full Name"), "Alex Doe");
    await user.type(screen.getByLabelText("Email Address"), "alex@example.com");
    await user.type(screen.getByLabelText(/^Password$/), "Password123");
    await user.type(screen.getByLabelText("Confirm Password"), "Password123");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(register).toHaveBeenCalledWith("alex@example.com", "Password123", "Alex Doe");
    expect(success).toHaveBeenCalled();
  });

  it("displays server error when email is already taken", async () => {
    const user = userEvent.setup();
    const register = vi.fn().mockResolvedValue({ code: "EMAIL_TAKEN", message: "Email is already taken" });
    render(<SignUpPage onRegister={register} onSuccess={vi.fn()} />);

    await user.type(screen.getByLabelText("Full Name"), "Alex Doe");
    await user.type(screen.getByLabelText("Email Address"), "existing@example.com");
    await user.type(screen.getByLabelText(/^Password$/), "Password123");
    await user.type(screen.getByLabelText("Confirm Password"), "Password123");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(screen.getByRole("alert")).toHaveTextContent("An account with this email address already exists.");
  });
});
