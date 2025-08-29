export function normalizePlugins(
  plugins: string[] | Record<string, any> | undefined
): Record<string, any> {
  if (!plugins) {
    return {}
  }

  if (Array.isArray(plugins)) {
    return plugins.reduce(
      (acc, name) => {
        acc[name] = {}
        return acc
      },
      {} as Record<string, any>
    )
  }

  return plugins
}
