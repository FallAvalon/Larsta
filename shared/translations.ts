import { providerEnglish } from './provider-translations.js';
export type Language='ru'|'en';
const entries=`
Чаты|Chats
Персонажи|Characters
Персоны|Personas
Настройки|Settings
Все|All
Вы|You
Модель|Model
История|Story
Сервер|Server
Оформление|Appearance
Оформление чата|Chat appearance
Язык интерфейса|Interface language
Язык сохраняется только на этом устройстве.|Language is saved on this device only.
Русский|Русский
Английский|English
Shift+Enter — новая строка|Shift+Enter — new line
· Вы:|· You:
· по умолчанию|· default
Загрузка…|Loading…
МБ|MB
После сохранения ключ не возвращается в браузер и не хранится в Git.|Once saved, the key is not returned to the browser or stored in Git.
Сохранить персонажа|Save character
единиц контекста. Он ограничивает объём истории для выбранной модели.|context budget units. This limits how much history is sent to the selected model.
и|and
из|of
старых реплик из-за лимита контекста. Они сохранены в чате.|older messages because of the context limit. They remain saved in the chat.
токенов|tokens
токенов. Стоимость и доступность могут меняться на стороне OpenRouter.|tokens. Pricing and availability may change on OpenRouter.
**важные слова**|**important words**
*текст в звёздочках*|*text in asterisks*
. Карточка и персона добавляются отдельно. Изменения действуют со следующего ответа.|. The character and persona are added separately. Changes apply to the next response.
. Уточните поиск.|. Narrow your search.
> цитата|> quote
API-ключ|API key
Character Card V2 · до 2 МБ|Character Card V2 · up to 2 MB
Enter — отправить|Enter — send
Enter — отправить, Shift+Enter — новая строка|Enter — send, Shift+Enter — new line
ID модели|Model ID
ID модели этого чата|Model ID for this chat
JSON должен быть меньше 2 МБ.|The JSON file must be smaller than 2 MB.
Larsta · обычный|Larsta · standard
Larsta — чаты|Larsta — chats
OpenCode · совместимость|OpenCode · compatibility
PNG, JPEG, WebP или GIF · до 8 МБ|PNG, JPEG, WebP or GIF · up to 8 MB
[изображение:|[image:
[название](адрес)|[label](url)
{0} USD / 1М вх.|{0} USD / 1M input
» и ВСЕ его чаты? Это действие нельзя отменить.|” and ALL their chats? This cannot be undone.
Аватар|Avatar
Аватар персоны|Persona avatar
Аватарка на фоне чата|Character avatar as chat wallpaper
Адрес в локальной сети|Local network address
Адрес скопирован|Address copied
Бесплатно|Free
Биография, способности, отношения — что собеседнику нужно знать|Background, abilities, relationships — what the character should know
Боковая навигация|Sidebar navigation
Больше деталей|More detail
Больше диалога|More dialogue
Браузер не разрешил сохранение настроек.|Your browser did not allow these preferences to be saved.
Браузер не сохраняет черновик. До отправки не закрывайте страницу.|Your browser cannot save the draft. Keep this page open until you send it.
Быстрые пожелания|Quick suggestions
Бюджет включает карточку, инструкции и историю. Если места не хватает, старые реплики остаются в чате, но не передаются модели. Для модели с ручным ID проверьте доступный контекст в её описании.|The budget includes the character, instructions, and history. Older messages stay in the chat but may be omitted from model context. For a manually entered model ID, check its context limit.
В избранное|Add to favorites
В избранном|Favorited
Вариант|Variant
Вариант {0} из {1}|Variant {0} of {1}
Варианты ответа|Response variants
Ваша история ждёт продолжения.|Your story is waiting to continue.
Ваша персона|Your persona
Ваша следующая история|Your next story
Ваше сообщение|Your message
Ваши миры.|Your worlds.
Ваши персонажи.|Your characters.
Ваши роли в разговорах с персонажами.|Your roles in conversations with characters.
Введите на телефоне код из окна сервера. Подключённое устройство получает доступ ко всем чатам и настройкам. Используйте доверенную домашнюю сеть: соединение HTTP. Не открывайте порт в интернет. Если адресов несколько, выберите адрес Wi‑Fi адаптера.|Enter the code shown in the server window on your phone. Connected devices can access all chats and settings. Use a trusted home network: the connection uses HTTP. Do not expose the port to the internet. If several addresses are listed, choose your Wi-Fi adapter's address.
Введите новый ключ, чтобы заменить сохранённый|Enter a new key to replace the saved one
Верх|Top
Ветки истории|Story branches
Взять профиль из библиотеки|Use a profile from the library
Внешность|Appearance
Внешность, биография, важные детали|Appearance, background, important details
Вниз|Bottom
Возвращайтесь туда, где остановилась история.|Pick up where your story left off.
Войти в Larsta|Connect to Larsta
Все жанры|All genres
Все персонажи|All characters
Выберите JSON-карточку|Choose a JSON character card
Выберите модель, которая будет отвечать от лица персонажа.|Choose the model that will respond as the character.
Выберите персонажа и начните разговор.|Choose a character and start a conversation.
Выберите, с какого продолжения вернуться к истории.|Choose a branch to return to.
Выбран|Selected
Выбрать аватар|Choose avatar
Выбрать вариант|Select variant
Выбрать из каталога|Choose from catalog
Выбрать по умолчанию|Set as default
Высокий уровень|High
Где и как начинается история?|Where and how does the story begin?
Готово|Done
Далее|Next
Действия с персоной {0}|Actions for persona {0}
Действия с сообщением|Message actions
Действия с чатом|Chat actions
Длина ответа|Response length
Длинный · до 4096 токенов|Long · up to 4096 tokens
Для сохранения вариантов ответа перезапустите сервер через start.cmd и обновите страницу.|Restart the server with start.cmd and reload the page to save response variants.
Для этого чата|This chat
До|Up to
Добавьте внешность, характер и другие детали своей роли.|Add appearance, personality, and other details about your role.
Добавьте первого персонажа|Add your first character
Дополнительные поля Character Card V2|Additional Character Card V2 fields
Дополняют общий промпт. Неизвестные поля импортированной карточки сохраняются при экспорте. Lorebook и альтернативные приветствия пока не используются.|These extend the system prompt. Unknown imported fields are preserved on export. Lorebooks and alternate greetings are not used yet.
Доступны подстановки|Available placeholders:
Другой ответ|Another response
Ежедневная|Daily
Есть несохранённые изменения|You have unsaved changes
Жирный текст|Bold text
Загружаем…|Loading…
Загрузите карточку в формате Character Card V2. Персонаж появится в библиотеке как новая запись.|Upload a Character Card V2 file. It will be added to your library as a new character.
Загрузить аватар|Upload avatar
Закрыть|Close
Закрыть действия с чатом|Close chat actions
Закрыть панель|Close panel
Заметки автора|Creator notes
Заполнить|Fill
Запросы отправляет ваш домашний сервер.|Requests are sent by your home server.
Затемнение|Dim
Затемнение фона|Wallpaper dimming
Избранное|Favorites
Изменения действуют только в этой истории со следующего ответа. Переписка сохраняется.|Changes apply only to this story, starting with the next response. Existing messages are preserved.
Изменения сохраняются на этом устройстве сразу.|Changes are saved immediately on this device.
Изменить|Edit
Изменить персону {0}|Edit persona {0}
Импорт JSON|Import JSON
Импорт персонажа|Import character
Импортировать|Import
Импорт…|Importing…
Имя|Name
Имя персоны|Persona name
Инструкции персонажа|Character instructions
Инструкции после истории|Post-history instructions
Используются общие настройки приложения.|Using the app's global settings.
Истории не найдены|No stories found
Истории с персонажем|Stories with this character
Источник настроек|Settings source
К персонажам|Browse characters
К последним сообщениям|Jump to latest messages
К списку чатов|Back to chats
Каждое новое устройство подключается отдельно.|Connect each new device separately.
Как зовут вашего персонажа?|What is your character's name?
Карточка персонажа|Character card
Карточка сохранена, но аватар не загружен. {0}|The character was saved, but the avatar could not be uploaded. {0}
Каталог|Refresh catalog
Каталог моделей|Model catalog
Ключ не задан|No key saved
Ключ сохранён|Key saved
Книжный|Book
Код отображается в окне запущенного сервера.|The code is shown in the running server's window.
Код подключения|Connection code
Компактнее|Smaller
Контекст модели:|Model context:
Копии создаются ежедневно во время работы сервера и перед обновлением базы. Они хранятся на домашнем сервере. Восстановление выполняется при остановленном сервере.|Backups are created daily while the server is running and before database upgrades. They are stored on your home server. Stop the server before restoring a backup.
Копирование недоступно. Выделите и скопируйте текст вручную.|Copying is unavailable. Select and copy the text manually.
Короткий · до 512 токенов|Short · up to 512 tokens
Короткое описание для библиотеки|A short description for the library
Короче|Shorter
Крупнее|Larger
Курсив и действия|Italics and actions
ЛИЧНОЕ ПРОСТРАНСТВО ДЛЯ ИСТОРИЙ|YOUR PERSONAL STORY SPACE
Лимит ответа этого чата|Token limit for this chat
Максимальный размер аватара — 8 МБ.|The maximum avatar size is 8 MB.
Максимальный размер — 8 МБ.|The maximum file size is 8 MB.
Максимум токенов|Maximum tokens
Максимум токенов ответа|Maximum response tokens
Манера общения, привычки, ценности|Communication style, habits, values
Межстрочный интервал|Line spacing
Межстрочный интервал чата|Chat line spacing
Меньше — сдержаннее, больше — разнообразнее.|Lower is more restrained; higher is more varied.
Меняет HTTP-заголовки идентификации клиента. Доступ к выбранной модели проверяет OpenRouter.|Changes the client identification headers. OpenRouter determines access to the selected model.
Модели не найдены. Можно ввести ID ниже.|No models found. You can enter an ID below.
Модель для диалога|Conversation model
Модель и ответы|Model and responses
Модель не видит|The model cannot see
Модель не заявляет поддержку управления рассуждением.|This model does not advertise reasoning controls.
Модель не поддерживает этот параметр.|This model does not support this setting.
Модель не поддерживает явный лимит.|This model does not support an explicit limit.
Модель ответа ·|Response model ·
Модель пока не выбрана|No model selected
Модель этого чата|Model for this chat
Моя персона|My persona
Моя персона в этом чате|My persona in this chat
На телефоне варианты также переключаются горизонтальным свайпом по тексту ответа. Если ниже уже есть переписка, она сохранится в другой ветке.|On a phone, swipe horizontally on a response to switch variants. Any later conversation will be preserved in another branch.
На этом компьютере|On this computer
Назад|Back
Название|Name
Название чата|Chat title
Найти историю|Find a story
Найти персонажа|Find a character
Написать {0}…|Message {0}…
Напишите персонажу и начните вашу историю.|Message the character to start your story.
Например, больше диалога и меньше описаний|For example, more dialogue and less description
Настройки ответов сохранены|Response settings saved
Настройки сохранены|Settings saved
Настройки чата|Chat preferences
Начало вашей истории|The beginning of your story
Начать новый чат|Start a new chat
Не описывай мои действия|Do not describe my actions
Не удалось связаться с сервером. Ваша реплика сохранена.|Could not connect to the server. Your message is saved.
Недавние|Recent
Недавние истории|Recent stories
Низ|Bottom
Низкий уровень|Low
Новая ветка отсюда|New branch from here
Новая история|New story
Новая персона|New persona
Новый персонаж|New character
Нужен API-ключ|API key required
О персонаже|About this character
Общие|Global
Общие инструкции для всех новых ответов.|Shared instructions for all new responses.
Общий бюджет контекста|Total context budget
Обычная речь|Normal speech
Обычный|Standard
Обычный · до 1024 токенов|Standard · up to 1024 tokens
Одна история. На всех ваших устройствах.|One story. Across all your devices.
Описание для карточки|Library description
Описание и важные детали|Description and important details
Основная модель · ID|Main model · ID
Основная навигация|Main navigation
Основной текст|Body text
Остановить ответ|Stop response
Остановлен|Stopped
Остановлено|Stopped
Ответ прерван|Response interrupted
Откатить последний ход?|Undo the last turn?
Откатить ход|Undo turn
Откатываем…|Undoing…
Отключение или низкий уровень может помочь при задержках первого ответа.|Disabling or lowering reasoning may reduce the delay before a response starts.
Отключить|Disconnect
Отключить устройство|Disconnect device
Открыта новая ветка. Исходная история сохранена.|New branch opened. The original story is preserved.
Открыть|Open
Открыть на телефоне|Open on your phone
Открыть продолжение|Open branch
Отмена|Cancel
Отправить|Send
Отправить сообщение|Send message
Оценка контекста: {0} из {1} единиц бюджета|Estimated context: {0} of {1} budget units
Очистить поиск|Clear search
Очистить поиск чатов|Clear chat search
Ошибка генерации.|Generation failed.
Ошибка запроса.|Request failed.
ПРЕДПРОСМОТР|PREVIEW
ПРОДОЛЖИТЬ|CONTINUE
Первое слово ещё впереди.|The first word is still to come.
Первое слово — за вами|You have the first word
Первое сообщение|First message
Перегенерировать ответ|Regenerate response
Перед обновлением|Before upgrade
Переименовать|Rename
Переписка, персонажи и изображения.|Conversations, characters, and images.
Персона нового чата|Persona for the new chat
Персона по умолчанию выбирается для новых чатов. В каждой истории можно настроить её отдельную копию.|The default persona is selected for new chats. Each story keeps its own editable copy.
Персона сохранена|Persona saved
Персона сохранена, но аватар не загружен. {0}|The persona was saved, but the avatar could not be uploaded. {0}
Персона этого чата сохранена|Chat persona saved
Персона: {0}|Persona: {0}
Персонаж|Character
Персонаж первым начнёт разговор. Можно использовать {{user}} и {{char}}.|The character starts the conversation. You can use {{user}} and {{char}}.
Персонаж сохранён|Character saved
Персонаж удалён|Character deleted
Персонажи не найдены|No characters found
Пишет…|Writing…
Плавное открытие окон и появление новых сообщений. Учитывается системная настройка уменьшения движения.|Smooth opening of panels and appearance of new messages. Your system's reduced-motion preference is respected.
Плавные анимации|Smooth animations
По имени|By name
По названию|By title
По умолчанию|Default
По умолчанию модели|Model default
По умолчанию: {0}|Default: {0}
Подгонка изображения|Image fit
Подключаемся…|Connecting…
Подключение к OpenRouter|OpenRouter connection
Подключите устройства к одной сети Wi‑Fi.|Connect your devices to the same Wi-Fi network.
Подключитесь к домашнему серверу,|Connect to your home server
Подробный · до 2048 токенов|Detailed · up to 2048 tokens
Пожелание к ответу|Response guidance
Пожелание необязательно и действует один раз. Прежний ответ останется в вариантах, а его продолжение — в отдельной ветке.|Guidance is optional and applies once. The previous response stays in variants; its continuation is saved in a separate branch.
Поиск моделей|Search models
Поиск персонажей|Search characters
Поиск по названию или ID модели|Search by model name or ID
Поиск чатов|Search chats
Пока нет сохранённых копий.|No backups yet.
Показаны первые 80 из|Showing the first 80 of
Показать ключ|Show key
Полное описание|Full description
Положение по высоте|Vertical position
Положение фона|Wallpaper position
Получить вариант|Generate variant
Получить ответ|Get response
Попробуйте другой запрос или персонажа.|Try another search or character.
Попробуйте другой запрос или фильтр.|Try another search or filter.
Порядок|Order
Порядок персонажей|Character order
Порядок чатов|Chat order
После отключения для входа понадобится код сервера.|You will need the server code to reconnect.
Последняя ваша реплика вернётся в поле ввода, а ответы после неё будут убраны из текущей истории. Вся прежняя переписка останется в ветке «до отката».|Your last message returns to the composer, and later responses are removed from this story. The previous conversation is preserved in a branch created before undoing.
Посмотреть варианты ответа|View response variants
Поток ответа недоступен.|The response stream is unavailable.
Правила истории|Story instructions
Предпросмотр аватара|Avatar preview
Предыдущая страница чатов|Previous chat page
Предыдущие сообщения|Earlier messages
Предыдущий вариант ответа|Previous response variant
Прежнее продолжение сохранено в ветках истории.|The previous continuation is preserved in story branches.
Прежняя переписка сохранится в отдельной ветке. Текущий чат продолжится от изменённой реплики.|The previous conversation will be saved in a separate branch. This chat continues from the edited message.
Привычки, ценности, манера речи|Habits, values, way of speaking
Примеры диалогов|Example dialogue
Проверить|Verify
Продолжить|Continue
Продолжить ответ|Continue response
Продолжить отсюда в новой ветке|Continue from here in a new branch
Профиль используется для новых чатов. Уже начатые истории хранят свою копию.|This profile is used for new chats. Existing stories keep their own copy.
Профиль клиента OpenRouter|OpenRouter client profile
Разделы настроек|Settings sections
Размер текста|Text size
Размер текста чата|Chat text size
Размытие|Blur
Размытие фона|Wallpaper blur
Рассуждение модели|Model reasoning
Редактировать|Edit
Редактировать персонажа|Edit character
Редактировать персону|Edit persona
Редактировать сообщение|Edit message
Резервная копия прошла проверку.|Backup verified successfully.
Резервная копия создана и проверена.|Backup created and verified.
Резервные копии|Backups
Рост, внешность, одежда и другие приметы|Height, appearance, clothing, and other features
Ручная|Manual
С чего начнётся ваша история?|Where will your story begin?
Сбросить оформление|Reset appearance
Сбросить фильтры|Reset filters
Свой лимит|Custom limit
Связь прервалась. Ответ готовится на сервере — переподключаемся…|Connection lost. The server is still generating your response — reconnecting…
Сейчас здесь|Current branch
Сервер вернул некорректный ответ.|The server returned an invalid response.
Сервер недоступен|Server unavailable
Сервер недоступен. Проверьте, что он запущен и устройства подключены к одной сети.|The server is unavailable. Check that it is running and both devices are on the same network.
Сервер подключён|Server connected
Сервер также учитывает лимит модели.|The server also respects the model's limit.
Системный промпт|System prompt
Скопировать|Copy
Скопировать {0}|Copy {0}
Скопировать сообщение|Copy message
Скрыть ключ|Hide key
Скрыть уведомление|Dismiss notification
Следующая страница чатов|Next chat page
Следующие сообщения|Later messages
Следующий вариант ответа|Next response variant
Сначала новые|Newest first
Сначала старые|Oldest first
Соединение прервано. Обновите чат: сервер сохранит полученную часть ответа.|Connection interrupted. Reload the chat: the server will keep the received response.
Создайте карточку или импортируйте JSON.|Create a character card or import JSON.
Создать персонажа|Create character
Создать персону|Create persona
Создать резервную копию|Create backup
Создаём чат…|Creating chat…
Сообщение скопировано|Message copied
Сохранено. Прежняя версия доступна в ветках истории.|Saved. The previous version is available in story branches.
Сохранить|Save
Сохранить для чата|Save for this chat
Сохранить изменения|Save changes
Сохранить персону|Save persona
Сохраняем…|Saving…
Сохраняется в этом браузере|Saved in this browser
Список чатов|Chat list
Средний уровень|Medium
Ссылки|Links
Страницы чатов|Chat pages
Сценарий|Scenario
Теги|Tags
Текст варианта {0}|Variant {0} text
Текст ответа не получен.|No response text received.
Текст ответа не получен. Можно повторить генерацию.|No response text received. You can try generating again.
Текст сообщения|Message text
Текущая копия чата|Current chat copy
Текущий черновик будет добавлен ниже возвращённой реплики.|Your current draft will be appended below the restored message.
Температура|Temperature
Температура этого чата|Temperature for this chat
Только бесплатные|Free models only
Только для этой истории и её новых веток. Рассуждения модели тоже входят в лимит ответа.|Only for this story and its new branches. Model reasoning also counts toward the response limit.
Убрать из избранного|Remove from favorites
Удалить|Delete
Удалить персонажа|Delete character
Удалить персонажа «|Delete character “
Удалить персону|Delete persona
Удалить персону {0}|Delete persona {0}
Удалить персону «{0}»? Её копии в существующих чатах останутся.|Delete persona “{0}”? Its copies in existing chats will remain.
Удалить сохранённый ключ при сохранении настроек|Delete the saved key when saving settings
Удалить чат|Delete chat
Удалить этот чат и всю его переписку?|Delete this chat and its entire conversation?
Уже по умолчанию|Already the default
Указать ID вручную|Enter a model ID manually
Файл содержит некорректный JSON. Проверьте запятые, кавычки и скобки.|The file contains invalid JSON. Check commas, quotes, and brackets.
Фактический бюджет с учётом каталога:|Effective budget based on the catalog:
Фильтры персонажей|Character filters
Фильтры чатов|Chat filters
Фон автоматически меняется вместе с персонажем. Без аватарки остаётся тёмный фон.|The wallpaper follows the current character. Characters without an avatar use a dark background.
Фон из аватарки персонажа|Character avatar wallpaper
Характер|Personality
Ход возвращён в поле ввода. Прежняя версия — в ветках.|Your turn is back in the composer. The previous version is saved in branches.
Цвет: {0}|Color: {0}
Цвета текста и Markdown|Text and Markdown colors
Целиком|Fit
Цена по маршруту|Route-dependent price
Цитаты|Quotes
Чаты с персонажем|Chats with character
Чтение|Reading
Что изменить?|What should change?
Шаблон для создания карточки с помощью ИИ лежит в|A template for creating a character card is available in
Шрифт сообщений|Message font
Шрифт, цвета и фон сохраняются в этом браузере.|Font, colors, and wallpaper are saved in this browser.
Экспорт|Export
Это устройство|This device
фэнтези, приключения, драма|fantasy, adventure, drama
через запятую|comma-separated
чтобы продолжить историю.|to continue your story.
Развернуть: {0}|Expand: {0}
Развернуть|Expand
Применить|Apply
Прежняя версия останется в ветке. История продолжится от этой реплики.|The previous version stays in a branch. The story continues from this message.
Выйти без сохранения изменений?|Leave without saving changes?
Не сохранять|Discard
Продолжить правку|Keep editing
Ctrl / ⌘ + Enter — сохранить|Ctrl / ⌘ + Enter to save
Дождитесь завершения текущего действия.|Wait for the current action to finish.
Размышляет…|Thinking…
Размышления|Thoughts
Свернуть размышления|Collapse thoughts
Необязательно|Optional
Подсказки|Suggestions
Предыдущий ответ сохранится|The previous response will be kept
`.trim().split('\n').map(line=>line.split('|'));
export const english:Record<string,string>=Object.fromEntries(entries);
Object.assign(english,providerEnglish);
Object.assign(english,Object.fromEntries(`
API-ключ должен занимать одну строку.|The API key must be a single line.
OpenRouter вернул пустой ответ. Повторите запрос.|OpenRouter returned an empty response. Try again.
OpenRouter не принял API-ключ. Обновите ключ в настройках.|OpenRouter rejected the API key. Update it in settings.
OpenRouter не успел ответить. Повторите запрос позже.|OpenRouter timed out. Try again later.
OpenRouter отклонил запрос: проверьте разрешения ключа и ограничения модели.|OpenRouter rejected the request. Check the key permissions and model restrictions.
OpenRouter отклонил параметры. Проверьте ID модели, длину контекста и настройки ответа.|OpenRouter rejected the parameters. Check the model ID, context budget, and response settings.
OpenRouter прервал поток. Реплика и полученная часть ответа сохранены.|OpenRouter interrupted the stream. Your message and the partial response are saved.
OpenRouter прислал некорректный поток. Полученная часть ответа сохранена.|OpenRouter returned an invalid stream. The partial response is saved.
В контексте нет реплики пользователя. Увеличьте бюджет контекста.|There is no user message in the context. Increase the context budget.
В ответе пока нет текста для продолжения.|There is no response text to continue yet.
В этом чате ещё нет хода для отката.|There is no user turn to undo in this chat yet.
В этом чате идёт генерация. Сначала остановите её.|A response is being generated in this chat. Stop it first.
Вариант ответа не найден.|Response variant not found.
Введите код подключения из окна сервера.|Enter the connection code from the server window.
Внутренняя ошибка OpenRouter или провайдера. Попробуйте позже.|Internal OpenRouter or provider error. Try again later.
Внутренняя ошибка сервера. Данные уже сохранённых сообщений не потеряны.|Internal server error. Previously saved messages are safe.
Время ожидания ответа истекло. Полученная часть сохранена.|The response timed out. The partial response is saved.
Выберите изображение PNG, JPEG, GIF или WebP до 8 МБ.|Choose a PNG, JPEG, GIF, or WebP image up to 8 MB.
Выберите основную модель в настройках. Ваша реплика сохранена.|Choose a main model in settings. Your message is saved.
Выберите ответ персонажа.|Select a character response.
Выбранная модель сейчас недоступна. Попробуйте позже или выберите другую модель.|The selected model is unavailable. Try again later or choose another model.
Выбранный вариант изменился. Обновите переписку.|The selected variant has changed. Reload the conversation.
Для ответа нужна последняя реплика пользователя.|A user message must be the last message before generating a response.
Добавьте API-ключ OpenRouter в настройках. Ваша реплика сохранена.|Add an OpenRouter API key in settings. Your message is saved.
Дождитесь завершения ответов перед созданием копии.|Wait for active responses to finish before creating a backup.
Достигнут лимит запросов OpenRouter. Подождите перед повторной попыткой.|OpenRouter's rate limit was reached. Wait before trying again.
Запрос с другого сайта запрещён.|Requests from another site are not allowed.
Запрос слишком большой для провайдера. Уменьшите бюджет контекста или размер карточки.|The request is too large for the provider. Reduce the context budget or character card size.
Изменение удалит все последующие сообщения. Подтвердите удаление.|Editing this message will remove later messages. Confirm to proceed.
Используйте localhost или IP-адрес домашнего сервера.|Use localhost or your home server's IP address.
Карточка и системные инструкции превышают бюджет контекста. Сократите их или увеличьте бюджет в настройках.|The character card and system instructions exceed the context budget. Shorten them or increase the budget in settings.
Ключ задан переменной окружения сервера. Удалите её и перезапустите сервер.|The key is set by a server environment variable. Remove it and restart the server.
Код не подошёл. Посмотрите код в окне запущенного сервера.|Incorrect code. Check the code in the running server window.
Место в переписке не найдено.|The requested position in the conversation was not found.
Метод API не найден.|API endpoint not found.
Модель израсходовала лимит токенов на рассуждение и не дошла до ответа. Увеличьте максимум токенов ответа в настройках или снизьте уровень рассуждения.|The model used its token limit for reasoning without producing a response. Increase the response limit or lower reasoning effort.
Модель не вернула текст. Проверьте ограничения модели и повторите запрос.|The model returned no text. Check its restrictions and try again.
Модель не найдена. Обновите каталог или проверьте её ID.|Model not found. Refresh the catalog or check its ID.
Модель отклонила параметры запроса. Проверьте режим рассуждения и лимит ответа.|The model rejected the request parameters. Check reasoning effort and the response limit.
Модель передала рассуждение, но не вернула текст ответа. Повторите запрос или увеличьте максимум токенов ответа.|The model returned reasoning but no response text. Try again or increase the response token limit.
Не удалось загрузить каталог OpenRouter. Проверьте интернет или введите ID модели вручную.|Could not load the OpenRouter catalog. Check your internet connection or enter a model ID manually.
Не удалось загрузить файл. Допустимо одно изображение до 8 МБ.|Could not upload the file. One image up to 8 MB is allowed.
Неверный адрес сервера.|Invalid server address.
Неверный идентификатор резервной копии.|Invalid backup identifier.
Недостаточно средств или исчерпан бюджет ключа OpenRouter. Выберите доступную бесплатную модель самостоятельно.|Insufficient balance or OpenRouter key budget exhausted. Choose an available free model yourself.
Некорректная резервная копия.|Invalid backup.
Некорректный JSON. Проверьте синтаксис файла.|Invalid JSON. Check the file syntax.
Некорректный путь в резервной копии.|Invalid path in the backup.
Неподдерживаемое изображение. Используйте PNG, JPEG, GIF или WebP; SVG запрещён.|Unsupported image. Use PNG, JPEG, GIF, or WebP. SVG is not allowed.
Оставьте хотя бы одну персону. Можно изменить её имя и описание.|Keep at least one persona. You can edit its name and description.
Ответ персонажа не найден.|Character response not found.
Ответ превысил допустимый размер. Полученная часть сохранена.|The response exceeded the size limit. The partial response is saved.
Перегенерация старого ответа удалит все последующие сообщения. Подтвердите удаление.|Regenerating an older response will remove later messages. Confirm to proceed.
Персона не найдена.|Persona not found.
Персонаж не найден.|Character not found.
Пожелание доступно при перегенерации ответа.|Guidance is only available when regenerating a response.
Попытка уже завершилась. Обновите чат.|This attempt has already finished. Reload the chat.
Последнее сообщение не помещается в бюджет контекста. Сократите его или увеличьте бюджет.|The last message does not fit the context budget. Shorten it or increase the budget.
Поток прерван. Полученная часть и ваша реплика сохранены.|The stream was interrupted. Your message and the partial response are saved.
Провайдер модели вернул ошибку. Попробуйте позже или самостоятельно выберите другую модель.|The model provider returned an error. Try again later or choose another model yourself.
Провайдер модели не успел ответить. Полученная часть сохранена; повторите запрос позже.|The model provider timed out. The partial response is saved. Try again later.
Провайдер модели превысил время ожидания. Полученная часть сохранена; повторите запрос позже.|The model provider exceeded its time limit. The partial response is saved. Try again later.
Провайдер перегружен. Повторите запрос позже или выберите другую модель вручную.|The provider is overloaded. Try again later or choose another model manually.
Проверка резервной копии не пройдена: файл изменён или отсутствует.|Backup verification failed: a file is missing or changed.
Проверка целостности базы не пройдена.|Database integrity check failed.
Размышление модели превысило допустимый размер. Полученная часть сохранена.|Model reasoning exceeded the size limit. The received part is saved.
Резервная копия не найдена.|Backup not found.
Сервер был перезапущен во время этой попытки. Обновите чат и явно запросите новый ответ.|The server restarted during this attempt. Reload the chat and explicitly request a new response.
Слишком много попыток. Повторите подключение через 15 минут.|Too many attempts. Try connecting again in 15 minutes.
Смена старого ответа удалит все последующие сообщения. Подтвердите удаление.|Changing an older response will remove later messages. Confirm to proceed.
Соединение оборвалось до завершения ответа. Полученная часть сохранена.|The connection closed before the response finished. The partial response is saved.
Сообщение не найдено.|Message not found.
Файл или запрос слишком большой. Максимум JSON — 2 МБ.|The file or request is too large. The JSON limit is 2 MB.
Чат изменился на другом устройстве. Обновите переписку перед генерацией.|The chat changed on another device. Reload it before generating a response.
Чат изменился на другом устройстве. Обновите переписку.|The chat changed on another device. Reload the conversation.
Чат изменился. Обновите переписку.|The chat has changed. Reload the conversation.
Чат или выбранный вариант изменился на другом устройстве. Обновите переписку.|The chat or selected variant changed on another device. Reload the conversation.
Чат не найден.|Chat not found.
Этот идентификатор запроса уже использован для другого действия.|This request identifier was already used for a different action.
до отката|before undo
до правки|before edit
другое продолжение|alternate continuation
ветка|branch
Прежняя переписка сохранится в отдельной ветке. Текущая история продолжится от изменённой реплики.|The previous conversation will be saved in a separate branch. This story continues from the edited message.
Проверьте поле «{0}»: неверный тип или допустимый диапазон.|Check field “{0}”: invalid type or value range.
Некорректная карточка Character Card V2: проверьте поле «{0}». Нужны spec: chara_card_v2, spec_version: 2.0 и объект data. Сверьтесь с examples/character-v2.json.|Invalid Character Card V2: check field “{0}”. Required: spec chara_card_v2, spec_version 2.0, and a data object. See examples/character-v2.json.
OpenRouter вернул ошибку {0}. Реплика и полученная часть ответа сохранены.|OpenRouter returned error {0}. Your message and the partial response are saved.
Нет соединения с OpenRouter. Проверьте интернет.{0}|No connection to OpenRouter. Check your internet connection.{0}
Поток OpenRouter оборвался. Полученная часть ответа сохранена.{0}|The OpenRouter stream was interrupted. The partial response is saved.{0}
 Код сбоя: {0}.| Error code: {0}.
OpenRouter вернул ответ не в формате потока (HTTP {0}, {1}). Повторите запрос позже.|OpenRouter returned a non-streaming response (HTTP {0}, {1}). Try again later.
`.trim().split('\n').map(line=>line.split('|'))));
english['<START>\n{{user}}: Привет.\n{{char}}: Я ждал тебя.']='<START>\n{{user}}: Hello.\n{{char}}: I was waiting for you.';
english['*На столе лежит открытая книга.*\n\n— У каждой истории есть **своё начало**. Каким будет наше?\n\n> Некоторые слова хочется сохранить.\n\n[Письмо из архива](#)']='*An open book rests on the table.*\n\nEvery story has **a beginning**. What will ours be?\n\n> Some words are worth keeping.\n\n[A letter from the archive](#)';

const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const patterns=Object.entries(english).filter(([key])=>/\{\d+\}/.test(key)).map(([key,value])=>({regex:new RegExp('^'+key.split(/\{\d+\}/).map(escape).join('([\\s\\S]*?)')+'$','u'),value}));
export function translate(text:string,language:Language,values?:Record<string,string|number>):string{
  const interpolate=(value:string)=>value.replace(/\{(\d+)\}/g,(match,key)=>values&&key in values?String(values[key]):match);
  if(language==='ru')return interpolate(text);
  const trimmed=text.trim(),prefix=text.slice(0,text.indexOf(trimmed)),suffix=text.slice(text.indexOf(trimmed)+trimmed.length);
  if(trimmed in english)return prefix+interpolate(english[trimmed])+suffix;
  if(!values)for(const {regex,value}of patterns){const match=trimmed.match(regex);if(match)return prefix+value.replace(/\{(\d+)\}/g,(_,key)=>match[Number(key)+1])+suffix;}
  let result=interpolate(text);
  for(const [key,value]of Object.entries(english).filter(([key])=>key.length>=20&&!key.includes('{')).sort((a,b)=>b[0].length-a[0].length))result=result.replaceAll(key,value);
  return result.replace(/Повторите через (\d+) с\./g,'Try again in $1 seconds.').replace(/Код сбоя:/g,'Error code:');
}
