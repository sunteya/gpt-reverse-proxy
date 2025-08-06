export function stripPrefix(path: string, prefix: string | null | undefined): string {
  if (prefix && path.startsWith(prefix)) {
    let stripped = path.substring(prefix.length)
    if (!stripped.startsWith('/')) {
      stripped = `/${stripped}`
    }
    return stripped
  }
  return path
}
