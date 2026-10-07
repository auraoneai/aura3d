export const AURA_CLASH_PUBLIC_BASE_PATH = "/showcase/aura-clash";

export function auraClashHref(route: string = ""): string {
  const cleanRoute = route.replace(/^\/+|\/+$/g, "");
  return cleanRoute.length > 0
    ? `${AURA_CLASH_PUBLIC_BASE_PATH}/${cleanRoute}/`
    : `${AURA_CLASH_PUBLIC_BASE_PATH}/`;
}
