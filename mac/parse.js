// 把一行 ntfy JSON 拆成 topic\x1f title\x1f message
function run(argv) {
  const m = JSON.parse(argv[0]);
  return [m.topic || '', m.title || '', m.message || ''].join('\x1f');
}
