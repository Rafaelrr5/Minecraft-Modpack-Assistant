/**
 * Parse Minecraft `options.txt` keybind lines into the normalized `bindingId → key` map the
 * keybinding detector consumes (spec 0007 FR-7; DOMAIN-KNOWLEDGE §5). Pure string processing — the
 * file itself is read by the CLI through the guarded `InstanceFs`; the core never touches the disk.
 *
 * Lines look like `key_key.jump:key.keyboard.space`. The key token's last dotted segment is the
 * human key (`key.keyboard.r` → `R`), uppercased so it matches the curated default-binds dataset.
 */
export function parseOptionsKeybinds(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith('key_')) continue;
    const idx = t.indexOf(':');
    if (idx < 0) continue;
    const binding = t.slice(0, idx);
    const token = t.slice(idx + 1).trim();
    const last = token.split('.').pop() ?? '';
    if (!last || last.toLowerCase() === 'unknown') continue; // unbound — ignore
    out[binding] = last.toUpperCase();
  }
  return out;
}
