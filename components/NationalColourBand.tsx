/**
 * The national colour band across the top of the sign-in page.
 *
 * The one place in this codebase where a literal colour is correct. These are
 * the Indian flag's saffron and green as the Flag Code specifies them; they are
 * not a palette choice, they do not belong to the tenant, and a design system
 * has no business theming them. `scripts/check-no-hardcoded-color.mjs` allows
 * this file by name for exactly that reason — which is why the band lives here
 * rather than inline on a page, where the allowance would have covered
 * everything else on it too.
 *
 * White is the middle third and stays white on any ground, so the band is drawn
 * on its own opaque strip rather than over the page.
 */
export default function NationalColourBand() {
  return (
    <div className="flex h-1.5 w-full shrink-0" aria-hidden>
      <div className="flex-1" style={{ background: "#FF9933" }} />
      <div className="flex-1" style={{ background: "#FFFFFF" }} />
      <div className="flex-1" style={{ background: "#138808" }} />
    </div>
  );
}
