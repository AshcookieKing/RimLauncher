/** Статический путеводитель — дополняется данными из Discord API */
module.exports = {
  team: [
    { name: 'ASH Cookie King', role: 'Создатель проекта / Тех. директор' },
    { name: 'AWI', role: 'Куратор проекта' },
    { name: 'Molten', role: 'Комьюнити менеджер' },
    { name: 'Xenon', role: 'Глав. модер / Кур. Ордена' },
    { name: '[HQ] CoL 1963 Bright (mr Klipsik)', role: 'Глава ивентологии' },
  ],
  sections: [
    {
      id: 'rules',
      title: 'РП правила',
      channelId: '1473748089872453647',
      url: 'https://docs.google.com/document/d/17FavuZ8Dtl2UUsWZvYtX5LeqItrhgke69MemjqXhdbw/edit?tab=t.0#heading=h.4o96atchxlwt',
      summary: 'Основа игры на сервере: уважение к игрокам, отыгрыш персонажа клона/офицера ВАР, запрет на RDM/VDM, метагейм и powergaming. Следуйте приказам старших по званию в рамках RP.',
    },
    {
      id: 'about',
      title: 'О проекте',
      channelId: '1473748089872453650',
      summary: 'StarFront — RP-сервер Clone Wars в Arma 3. Играем за Великую Армию Республики, участвуем в операциях, ивентах и сюжетных линиях.',
    },
    {
      id: 'donations',
      title: 'Лист пожертвований',
      channelId: '1481200530251448340',
      url: 'https://boosty.to/imagundi/donate',
      summary: 'Поддержка проекта через Boosty. За пожертвование можно получить RIM POINT в лаунчере (ключ подтверждения после оплаты).',
    },
    {
      id: 'ustav',
      title: 'Устав ВАР — новичку',
      channelId: null,
      url: 'https://docs.google.com/document/d/1Ucpl_lrnF7r_56hqMlcccZ1vc8jvF1y4_ylrXdx0jhQ/edit?tab=t.0#heading=h.qz0zsy6lnh8u',
      summary: `Звания: CT (клон-трупер), SGT, LT, CPT, MAJ, COL, CC, MC и др. Обращение по званию. Структура: легион → рота → отделение. Дисциплина, подчинение приказам, форма и позывной по уставу.`,
      bullets: [
        'Позывной и номер — часть RP-имени профиля Arma 3',
        'Звание определяет вашу роль в строю и на операциях',
        'Нарушения устава — предупреждение, выговор, понижение (по решению командования)',
        'На сервере действует иерархия: приказ старшего — закон в бою',
      ],
    },
    {
      id: 'stroevoy',
      title: 'Строевой устав',
      channelId: null,
      url: 'https://docs.google.com/document/d/1noDu9o9iQ2bNl_YACkkcQXJ5Cp_-JMLD4FGk8SKZ8VI/edit?tab=t.0#heading=h.28f7eqju0fw5',
      summary: 'Правила построения, салютирования, обращения к офицерам. В строю — молчание, unless приказано иное. Движение только по команде.',
    },
    {
      id: 'kmb',
      title: 'КМБ — курс молодого бойца',
      channelId: null,
      urls: [
        'https://docs.google.com/document/d/1xrM9VG8i2W4oHcBqiIbzNl4klfdRd4eBZZiYngLupvI/edit?tab=t.0#heading=h.l5c1thdz8q33',
        'https://docs.google.com/document/d/1g1rXoCt0EgA9sOFiLnBUjmfLtPcy1z9Zjikqcxw1mEs/edit?tab=t.0',
      ],
      urlLabels: ['КМБ — основной', 'Курс молодого бойца'],
      summary: 'Обязательное обучение для новобранцев: основы ACE, медицина, связь (TFAR/TeamSpeak), построение, базовые приказы.',
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
    { title: 'Профиль Arma 3', text: 'Создайте или выберите профиль в настройках. Звание читается из имени профиля по Уставу ВАР.' },
    { title: 'Discord ID', text: 'Укажите свой Discord ID для RIM POINT, тикетов поддержки и персонализации.' },
    { title: 'Моды', text: 'При нажатии СТАРТ лаунчер проверит и обновит моды из пресета автоматически.' },
    { title: 'TeamSpeak + TFAR', text: 'Перед запуском игры лаунчер подключит вас к TeamSpeak 185.104.249.127:10026 (пароль StarFront) и установит плагин TFAR.' },
    { title: 'Путеводитель', text: 'Изучите правила, устав и КМБ в разделе «Гайд». Удачи, trooper!' },
  ],
};
