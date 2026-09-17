// 普通通知
function run(argv) {
  const app = Application.currentApplication();
  app.includeStandardAdditions = true;
  app.displayNotification(argv[1] || '', { withTitle: argv[0] || '小窝', soundName: 'Glass' });
  return '';
}
