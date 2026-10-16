interface AuthErrorLike {
  message: string;
  code?: string;
  name?: string;
  status?: number;
}

export function describeAuthError(error: AuthErrorLike): string {
  switch (error.code) {
    case "invalid_credentials":
      return "That email and password do not match.";
    case "email_not_confirmed":
      return "Confirm your email first. Open the link we sent, then sign in here.";
    case "user_already_exists":
    case "email_exists":
      return "An account with this email already exists. Sign in instead.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many attempts. Wait a minute and try again.";
    case "signup_disabled":
      return "New accounts are turned off for this app.";
  }
  if (error.name === "AuthRetryableFetchError" || error.status === 0 || /failed to fetch|network/i.test(error.message)) {
    return "You are offline. Connect to the internet to sign in.";
  }
  return error.message;
}
