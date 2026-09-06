/** Статический путеводитель — дополняется данными из Discord API */
module.exports = {
  rpRulesUrl: 'http://109.248.4.174:8090/',
  teamspeakDownloadUrl: 'https://www.filepuma.com/download/teamspeak_client_64bit_3.3.0-22604/',
  team: [
    { name: 'ImaGunDi', role: 'Тех. Администрация', discord_id: '369169793292566529' },
    { name: 'VisCi', role: 'Руководство проекта', discord_id: '427781570112520204' },
    { name: '[CG SW] LT XVI Tower', role: 'Руководство проекта', discord_id: '915588352089133086' },
    { name: '[CG] SLT 1443 Lanc | ARC', role: 'Руководство проекта', discord_id: '400725682369462272' },
    { name: '[38] CC 7772 Ash | CMD', role: 'Создатель', discord_id: '276670342469124096' },
    { name: '[CG]MLT 9750 Spark/[MERC]Kindred', role: 'РП наблюдатель', discord_id: '475059837021978634' },
  ],
  sections: [
    {
      id: 'verify',
      title: 'Верификация персонажа',
      channelId: null,
      summary:
        'Чтобы начать играть, верифицируйте персонажа. Фракция CR = ВАР. Подайте заявку (ник Discord, фракция, ник с препиской, звание опционально). Модерация ставит ✅ вручную. Если ВАР и преписка подразделения (CG/104/83/38) — дополнительно одобряет командир. После одобрения лаунчер создаст профиль.',
      bullets: [
        'Ник в Discord — как на сервере проекта',
        'Фракция: ВАР (CR), БСО, Джедаи, Наймы',
        'Ник с препиской: [CG] 0327 IMA или [CR] 0327 IMA',
        'Звание — если уже есть, иначе можно не указывать',
        'ВАР + преписка подразделения → одобрение командира + ✅ модерации',
        'После одобрения ВАР откроется «Вступить в подразделение»',
      ],
      action: 'verify',
    },
    {
      id: 'about',
      title: 'О проекте',
      channelId: '1479125948459778051',
      summary:
        'StarFront — RP-сервер Clone Wars в Arma 3. Следите за видео в новостях лаунчера и на TikTok @starfrontrp.',
      url: 'https://www.tiktok.com/@starfrontrp',
    },
    {
      id: 'ustav',
      title: 'Устав ВАР',
      channelId: null,
      url: 'https://docs.google.com/document/d/1Y5ycWrdkpOvzOmQ3j0a8m71CL85ZWilYOcPYj1gcb8I/edit?tab=t.0',
      summary:
        'Основной устав проекта StarFront: звания, структура подразделений, дисциплина и нормы поведения на сервере.',
      bullets: [
        'Позывной и номер — часть RP-имени профиля Arma 3',
        'Звание определяет вашу роль в строю и на операциях',
        'На сервере действует иерархия: приказ старшего — закон в бою',
      ],
    },
    {
      id: 'kmb',
      title: 'КМБ — курс молодого бойца',
      channelId: null,
      url: 'https://docs.google.com/document/d/14RUHKcykwlMBl8x95WoIeQuJWt_2wQ88sG5sVb0uPIE/edit?usp=sharing',
      summary:
        'Обязательное обучение для новобранцев: основы ACE, медицина, связь (TFAR/TeamSpeak), построение, базовые приказы.',
    },
    {
      id: 'database',
      title: 'Базы данных',
      channelId: null,
      urls: [
        'https://docs.google.com/document/d/1ophIngBqGflu6vj3J9S0RPPPrXuxxxwG6sxxa9PO5Sg/edit?tab=t.0#heading=h.ndshitveupu2',
        'https://docs.google.com/document/d/1aZXKukVqZewc8VXFW_E2ePcQtJAEY6KwwwsEm4UqdWQ/edit?tab=t.0',
        'https://docs.google.com/document/d/1yTWp8AeMCCMQ78xADXPxtjpdPw-NzWoobDfLJ0e4c1o/edit?tab=t.0',
      ],
      urlLabels: ['База данных КНС', 'Общая база данных ВАР', 'Доп. база данных'],
      summary: 'Справочники по подразделениям, технике, вооружению и лору. Используйте перед операциями.',
    },
  ],
  tutorialSteps: [
    { title: 'Добро пожаловать', text: 'Это лаунчер StarFront. Здесь вы запускаете игру, читаете новости и проходите обучение.' },
    {
      title: 'Верификация персонажа',
      text: 'Чтобы начать играть, верифицируйте персонажа: заявка в гайде (Discord, фракция ВАР/CR, ник с препиской, звание по желанию). Модерация ставит ✅ вручную; при преписке подразделения дополнительно одобряет командир — затем лаунчер создаст профиль.',
    },
    { title: 'Профиль Arma 3', text: 'После верификации создайте или выберите профиль. Для CR можно вступить в подразделение прямо из карточки звания.' },
    { title: 'Discord ID', text: 'Привяжите Discord для STAR POINT, тикетов поддержки и заявок в подразделения.' },
    { title: 'Моды', text: 'При нажатии СТАРТ лаунчер проверит и обновит моды из пресета SF4 автоматически.' },
    {
      title: 'TeamSpeak + TFAR',
      text: 'Установите TeamSpeak 3 (рекомендуется 3.3.x, при необходимости обновите до 3.6.2). Подключение → Подключиться → в поле «Адрес сервера» введите StarFront (пароль StarFront). Лаунчер также подключит автоматически и установит TFAR.',
    },
    { title: 'Путеводитель', text: 'Изучите устав, КМБ и РП правила на сайте проекта. Удачи, trooper!' },
  ],
};
