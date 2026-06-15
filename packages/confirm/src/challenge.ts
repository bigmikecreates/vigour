// Unambiguous alphabet (no O/0, I/1) for a phrase the user types back.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function genChallenge(len = 4): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
  }
  return out;
}
