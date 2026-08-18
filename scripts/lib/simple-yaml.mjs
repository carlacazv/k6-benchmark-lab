function stripInlineComment(value) {
  let single = false;
  let double = false;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === "'" && !double) single = !single;
    if (ch === '"' && !single && value[i - 1] !== '\\') double = !double;
    if (ch === '#' && !single && !double && (i === 0 || /\s/.test(value[i - 1]))) {
      return value.slice(0, i).trimEnd();
    }
  }
  return value.trimEnd();
}

function parseScalar(raw) {
  const value = stripInlineComment(raw.trim());
  if (value === '') return '';
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

export function parseSimpleYaml(text) {
  const root = {};
  const stack = [{ indent: -1, object: root }];
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue;
    if (/\t/.test(rawLine.match(/^\s*/)?.[0] ?? '')) {
      throw new Error(`YAML line ${index + 1}: tabs are not supported; use spaces.`);
    }

    const indent = rawLine.length - rawLine.trimStart().length;
    const content = rawLine.trim();
    if (content.startsWith('- ')) {
      throw new Error(`YAML line ${index + 1}: lists are intentionally not supported in performance plans; use named mapping fields.`);
    }

    const separator = content.indexOf(':');
    if (separator <= 0) throw new Error(`YAML line ${index + 1}: expected "key: value".`);
    const key = content.slice(0, separator).trim();
    const rawValue = content.slice(separator + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key)) {
      throw new Error(`YAML line ${index + 1}: unsupported key "${key}".`);
    }

    while (stack.length > 1 && stack.at(-1).indent >= indent) stack.pop();
    const parent = stack.at(-1).object;
    if (Object.hasOwn(parent, key)) throw new Error(`YAML line ${index + 1}: duplicate key "${key}".`);

    if (rawValue === '' || rawValue.startsWith('#')) {
      parent[key] = {};
      stack.push({ indent, object: parent[key] });
    } else {
      parent[key] = parseScalar(rawValue);
    }
  }
  return root;
}
