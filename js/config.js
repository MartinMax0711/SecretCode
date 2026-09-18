// 网站的基本设置，改这里就行
export const VERSION = '2026.09.17-7';

export const CONFIG = {
  herName: '晗晗',
  hisName: '耀耀',

  // 头像（放在 assets/ 里）
  avatarHer: 'assets/avatar-her.jpg',
  avatarHim: 'assets/avatar-him.jpg',

  // 老公铃用的推送频道（ntfy.sh）。电脑端监听脚本会读这个值，改了要重新运行 mac/install.sh
  ntfyServer: 'https://ntfy.sh',
  ntfyTopic: 'hanhan-bell-cwm003idg60frr',

  // 课表
  scheduleFile: 'data/schedule.ics',
  // 学校所在时区；如果课表文件里带了时区，会优先用文件里的
  schoolTimeZone: 'America/Los_Angeles',
};
