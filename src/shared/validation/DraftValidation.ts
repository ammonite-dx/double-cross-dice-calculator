export type DraftValidation<T> =
  | { readonly status: 'validating' }
  | { readonly status: 'invalid' }
  | { readonly status: 'valid'; readonly value: T }
