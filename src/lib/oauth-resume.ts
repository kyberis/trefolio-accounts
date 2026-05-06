/**
 * OIDC authorize params forwarded through email verification so after the user
 * confirms their inbox we can restore the `/oauth2/authorize?…` URL.
 */
export interface SP {
  client_id?: string;
  redirect_uri?: string;
  response_type?: string;
  scope?: string;
  state?: string;
  nonce?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  app_hint?: string;
  screen_hint?: string;
  signup?: string;
  /** OAuth authorize round-trip error code (display only). */
  error?: string;
  prompt?: string;
  /** OIDC optional end-user languages (space-separated BCP47 tags). */
  ui_locales?: string;
}
