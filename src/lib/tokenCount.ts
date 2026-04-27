import { getEncoding, type Tiktoken, type TiktokenEncoding } from "js-tiktoken";

/**
 * Token-counting adapter.
 *
 * Wrapped behind a tiny module so the encoder choice can be swapped out later
 * (model picker in settings, multi-provider tokenizers, etc) without rewriting
 * every call site. Today we lock to `cl100k_base` — the encoding used by
 * GPT-4 / GPT-3.5 family and a close-enough proxy for Claude. The encoder is
 * cached at module level so repeat calls don't pay the BPE-rank-load cost.
 */

const DEFAULT_ENCODING: TiktokenEncoding = "cl100k_base";

let cachedEncoder: Tiktoken | null = null;
let cachedEncodingName: TiktokenEncoding | null = null;

function getEncoder(encoding: TiktokenEncoding = DEFAULT_ENCODING): Tiktoken {
  if (cachedEncoder && cachedEncodingName === encoding) return cachedEncoder;
  cachedEncoder = getEncoding(encoding);
  cachedEncodingName = encoding;
  return cachedEncoder;
}

/**
 * Count tokens for a string using `cl100k_base` (the default, swappable later).
 *
 * Empty / nullish input returns 0 immediately so the common "prompt with no
 * content yet" case doesn't pay the encoder warmup. Special tokens in user
 * content are encoded literally (allowedSpecial/disallowedSpecial both empty)
 * — counting an instruction like "<|endoftext|>" should not crash the call.
 */
export function countTokens(text: string | null | undefined): number {
  if (!text) return 0;
  const encoder = getEncoder();
  return encoder.encode(text, [], []).length;
}
