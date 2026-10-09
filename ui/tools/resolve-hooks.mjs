// Node ESM resolve hook: @material/material-color-utilities@0.4.0 ships an
// extensionless relative import ('../dynamiccolor/dynamic_scheme'). Bundlers
// accept it; Node does not. Retry with '.js'. Test/tooling only.
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (e) {
    if (e && e.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) {
      return next(specifier + '.js', context);
    }
    throw e;
  }
}
