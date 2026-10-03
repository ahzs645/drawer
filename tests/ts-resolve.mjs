export async function resolve(specifier, context, next) {
  if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    try {
      return await next(`${specifier}.ts`, context)
    } catch {
      /* not a .ts module; fall through */
    }
  }
  return next(specifier, context)
}
