// Resolve the platform SDK to the local test double, before any app module loads.
export async function resolve(specifier, context, next) {
  if (specifier === 'sdk' || specifier.startsWith('sdk/')) {
    return { url: new URL('./sdk.mjs', import.meta.url).href, shortCircuit: true };
  }
  return next(specifier, context);
}
