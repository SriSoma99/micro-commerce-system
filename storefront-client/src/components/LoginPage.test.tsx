import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LoginPage } from "./LoginPage";

const setup = (onLogin = vi.fn().mockResolvedValue(null)) => {
  const onSuccess = vi.fn();
  render(<LoginPage onLogin={onLogin} onSuccess={onSuccess} demoAccount={{ email: "testuser@mydomain.com", password: "123456" }} />);
  return { onLogin, onSuccess, user: userEvent.setup() };
};

describe("LoginPage", () => {
  it("signs in with the entered credentials and moves on", async () => {
    const { onLogin, onSuccess, user } = setup();

    await user.type(screen.getByLabelText("Email"), "testuser@mydomain.com");
    await user.type(screen.getByLabelText("Password"), "123456");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onLogin).toHaveBeenCalledWith("testuser@mydomain.com", "123456");
  });

  it("does not call the API when a field is empty", async () => {
    const { onLogin, user } = setup();

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter your email and password.");
    expect(onLogin).not.toHaveBeenCalled();
  });

  it("shows a friendly message for a wrong password and stays on the page", async () => {
    const { onSuccess, user } = setup(vi.fn().mockResolvedValue({ ok: false, status: 401, code: "INVALID_CREDENTIALS", message: "Incorrect email or password" }));

    await user.type(screen.getByLabelText("Email"), "a@b.co");
    await user.type(screen.getByLabelText("Password"), "nope");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("don't match");
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("explains an account lockout and an unreachable service", async () => {
    const locked = setup(vi.fn().mockResolvedValue({ ok: false, status: 429, code: "ACCOUNT_LOCKED", message: "x" }));
    await locked.user.type(screen.getByLabelText("Email"), "a@b.co");
    await locked.user.type(screen.getByLabelText("Password"), "x");
    await locked.user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("15 minutes");
  });

  it("fills in the demo account with one click", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Fill in the demo account" }));

    expect(screen.getByLabelText("Email")).toHaveValue("testuser@mydomain.com");
    expect(screen.getByLabelText("Password")).toHaveValue("123456");
  });

  it("disables the button while signing in", async () => {
    let finish: (value: null) => void = () => {};
    const { user } = setup(vi.fn().mockReturnValue(new Promise<null>((resolve) => (finish = resolve))));

    await user.click(screen.getByRole("button", { name: "Fill in the demo account" }));
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
    finish(null);
  });
});
