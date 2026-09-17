// 把定位服务的结果整理成小窝要的格式（兼容 ip-api.com 和 ipapi.co）
function run(argv) {
  let src = {};
  try { src = JSON.parse(argv[0] || '{}'); } catch (e) { src = {}; }
  const num = (v) => (typeof v === 'number' ? v : null);
  const out = {
    city: src.city || '',
    region: src.regionName || src.region || '',
    country: src.country || src.country_name || '',
    lat: num(src.lat) ?? num(src.latitude),
    lon: num(src.lon) ?? num(src.longitude),
    battery: argv[1] || '',
    time: argv[2] || '',
  };
  return JSON.stringify(out);
}
