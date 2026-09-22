import { transparentize } from "polished"

export const safeTransparentize = (color: string, amount: number) => {
  try {
    return transparentize(amount, color)
  } catch (e) {
    console.error(e)
    return color
  }
}
