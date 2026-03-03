/**
 * Thrown when a page navigation ends up at the login page,
 * indicating the ParentPay server-side session has expired.
 * Actions catch this and automatically re-authenticate.
 */
export class SessionExpiredError extends Error {
  constructor(message = 'Session expired — redirected to login page') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}
