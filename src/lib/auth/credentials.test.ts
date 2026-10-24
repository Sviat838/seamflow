import { describe, expect, it } from "vitest";
import { CredentialsError, mapAuthError, parseCredentialsForm, typedEmail } from "./credentials";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function parseError(fields: Record<string, string>): CredentialsError {
  try {
    parseCredentialsForm(form(fields));
  } catch (error) {
    expect(error).toBeInstanceOf(CredentialsError);
    return error as CredentialsError;
  }
  throw new Error("expected a CredentialsError");
}

describe("parseCredentialsForm", () => {
  it("normalizes the email and defaults to sign-in", () => {
    expect(parseCredentialsForm(form({ email: "  Dana@Ballpark.Example ", password: "x" }))).toEqual({
      mode: "sign_in",
      email: "dana@ballpark.example",
      password: "x",
    });
  });

  it("requires at least 8 characters on sign-up only", () => {
    const error = parseError({ mode: "sign_up", email: "a@b.co", password: "short12" });
    expect(error).toMatchObject({ code: "INVALID_REQUEST", field: "password", message: "Use at least 8 characters." });
    expect(parseCredentialsForm(form({ mode: "sign_up", email: "a@b.co", password: "longenough" })).mode).toBe("sign_up");
    expect(parseCredentialsForm(form({ mode: "sign_in", email: "a@b.co", password: "short" })).password).toBe("short");
  });

  it("rejects passwords bcrypt would truncate", () => {
    expect(parseError({ mode: "sign_up", email: "a@b.co", password: "p".repeat(73) }).field).toBe("password");
  });

  it("points email problems at the email field", () => {
    expect(parseError({ email: "", password: "x" })).toMatchObject({ field: "email", message: "Enter your email address." });
    expect(parseError({ email: "not-an-email", password: "x" }).field).toBe("email");
    expect(parseError({ email: "a@b.co", password: "" })).toMatchObject({ field: "password", message: "Enter your password." });
  });

  it("treats unknown modes and missing fields as sign-in with empty values", () => {
    expect(parseError({ mode: "admin" }).field).toBe("email");
  });
});

describe("typedEmail", () => {
  it("echoes the typed email, trimmed and bounded", () => {
    expect(typedEmail(form({ email: "  Dana@x.co " }))).toBe("Dana@x.co");
    expect(typedEmail(new FormData())).toBe("");
    expect(typedEmail(form({ email: "a".repeat(400) })).length).toBe(254);
  });
});

describe("mapAuthError", () => {
  it("explains a taken email on the email field", () => {
    const error = mapAuthError({ code: "email_exists", status: 422 }, "sign_up");
    expect(error).toMatchObject({ code: "CONFLICT", field: "email" });
    expect(error.message).toMatch(/already exists/);
    expect(mapAuthError({ code: "user_already_exists" }, "sign_up").code).toBe("CONFLICT");
  });

  it("says wrong email or password, without revealing which", () => {
    expect(mapAuthError({ code: "invalid_credentials", status: 400 }, "sign_in")).toMatchObject({
      code: "UNAUTHORIZED",
      field: null,
      message: "Wrong email or password.",
    });
    expect(mapAuthError({ status: 400 }, "sign_in").code).toBe("UNAUTHORIZED");
  });

  it("maps weak passwords and rate limits", () => {
    expect(mapAuthError({ code: "weak_password" }, "sign_up")).toMatchObject({ code: "INVALID_REQUEST", field: "password" });
    expect(mapAuthError({ code: "over_request_rate_limit", status: 429 }, "sign_in")).toMatchObject({
      code: "RATE_LIMITED",
      retryAfterSeconds: 60,
    });
    expect(mapAuthError({ status: 429 }, "sign_up").code).toBe("RATE_LIMITED");
  });

  it("hides anything unexpected behind a retryable INTERNAL error", () => {
    const error = mapAuthError({ code: "email_provider_disabled", status: 400, message: "Email logins are disabled" }, "sign_up");
    expect(error).toMatchObject({ code: "INTERNAL", retryable: true, field: null });
    expect(error.message).not.toMatch(/disabled/);
  });
});
