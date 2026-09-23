declare module 'webfontloader' {
  export interface WebFontLoaderConfiguration {
    readonly google: {
      readonly families: readonly string[]
    }
  }

  export function load(configuration: WebFontLoaderConfiguration): void
}
