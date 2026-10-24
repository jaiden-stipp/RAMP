export function selectModule(ids, id, checked) {
  const kind = id.split('/')[0];
  const remaining = ids.filter(value => value !== id && !(checked && kind !== 'methods' && value.startsWith(`${kind}/`)));
  return checked ? [...remaining, id] : remaining;
}
