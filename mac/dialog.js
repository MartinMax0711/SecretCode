// 老公铃：弹窗，回复内容打印到标准输出
function run(argv) {
  const title = argv[0] || '老公铃';
  const message = argv[1] || '';
  const her = argv[2] || '晗晗';
  const app = Application.currentApplication();
  app.includeStandardAdditions = true;
  app.displayNotification(message, { withTitle: title, soundName: 'Glass' });
  app.activate();
  try {
    const r = app.displayDialog(message + '\n\n回一句话给' + her + '：', {
      withTitle: title,
      buttons: ['等我一下', '马上来！'],
      defaultButton: '马上来！',
      defaultAnswer: '',
      givingUpAfter: Number(argv[3]) || 300,
      withIcon: 'note',
    });
    if (r.gaveUp) return '';
    const typed = (r.textReturned || '').trim();
    return typed || r.buttonReturned;
  } catch (e) {
    return ''; // 点了取消或者没人在电脑前
  }
}
