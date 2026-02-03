(function () {
  'use strict';

  function startPlugin() {
    // Регистрация плагина
    Lampa.Manifest.plugins = Lampa.Manifest.plugins || [];
    Lampa.Manifest.plugins.push({
      name: 'Kinohost',
      description: 'Плагин для получения плееров с Kinobox API',
      version: '1.0.0',
      author: 'yalublushreka'
    });

    // Добавление компонента
    Lampa.Component.add('kinohost', Component);

    // Добавление языковых строк
    Lampa.Lang.add({
      kinohost_title: {
        ru: 'Kinohost',
        en: 'Kinohost',
        ua: 'Kinohost'
      },
      kinohost_full_title: {
        ru: 'Плееры Kinobox',
        en: 'Kinobox Players',
        ua: 'Плеєри Kinobox'
      },
      kinohost_error_no_id: {
        ru: 'Нет Kinopoisk ID',
        en: 'No Kinopoisk ID',
        ua: 'Немає Kinopoisk ID'
      },
      kinohost_error_load: {
        ru: 'Ошибка загрузки плееров',
        en: 'Error loading players',
        ua: 'Помилка завантаження плеєрів'
      },
      kinohost_empty_players: {
        ru: 'Нет доступных плееров',
        en: 'No players available',
        ua: 'Немає доступних плеєрів'
      }
    });

    // Добавление кнопки источника на страницу фильма
    Lampa.Listener.follow('full', function (e) {
      if (e.type == 'complite') {
        var btn = $(`
          <div class="full-start__button selector view--kinohost" data-subtitle="Плееры Kinobox">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="9" cy="9" r="8" stroke="currentColor" stroke-width="2"/>
              <path d="M6 6L12 9L6 12V6Z" fill="currentColor"/>
            </svg>
            <span>Kinohost</span>
          </div>
        `);

        // Вставляем кнопку после кнопки торрента или в конец списка кнопок
        var buttons = e.object.activity.render().find('.view--torrent');
        if (buttons.length) {
          buttons.after(btn);
        } else {
          e.object.activity.render().find('.full-start__buttons').append(btn);
        }

        // Обработчик нажатия на кнопку
        btn.on('hover:enter', function () {
          Lampa.Activity.push({
            url: '',
            title: 'Kinohost',
            component: 'kinohost',
            movie: e.data.movie,
            page: 1
          });
        });
      }
    });
  }

  function Component(object) {
    var network = new Lampa.Reguest();
    var scroll = new Lampa.Scroll({
      mask: true,
      over: true
    });
    var items = [];
    var html = $('<div></div>');
    var body = $('<div class="category-full"></div>');
    var last;

    this.create = function () {
      var _this = this;

      this.activity.loader(true);

      // Устанавливаем фон (опционально)
      // Lampa.Background.immediately('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');

      scroll.render().addClass('torrent-list');
      html.append(scroll.render());

      this.search();

      return this.render();
    };

    this.search = function () {
      var _this = this;

      // Получаем Kinopoisk ID
      var kinopoiskId = object.movie.kinopoisk_id;

      if (!kinopoiskId) {
        this.empty(Lampa.Lang.translate('kinohost_error_no_id'));
        return;
      }

      // API Kinobox перешел в закрытый режим и требует Origin: https://kinohost.web.app
      // Используем публичный CORS прокси для обхода ограничений
      var apiUrl = 'https://api.kinobox.tv/api/players?kinopoisk=' + kinopoiskId;
      var corsProxy = 'https://api.allorigins.win/raw?url=';

      // Пробуем сначала напрямую, затем через прокси
      network.silent(
        apiUrl,
        function (data) {
          // Успешный прямой запрос
          _this.buildPlayerList(data);
          _this.activity.loader(false);
        },
        function (error) {
          // Прямой запрос не сработал, пробуем через CORS прокси
          network.silent(
            corsProxy + encodeURIComponent(apiUrl),
            function (data) {
              // Парсим, если это строка
              var jsonData = typeof data === 'string' ? JSON.parse(data) : data;
              _this.buildPlayerList(jsonData);
              _this.activity.loader(false);
            },
            function (proxyError) {
              // И прокси не помог
              _this.empty(Lampa.Lang.translate('kinohost_error_load'));
            },
            false,
            {
              dataType: 'json'
            }
          );
        },
        false,
        {
          dataType: 'json'
        }
      );
    };

    this.buildPlayerList = function (apiResponse) {
      var _this = this;

      if (!apiResponse || !apiResponse.data || apiResponse.data.length === 0) {
        this.empty(Lampa.Lang.translate('kinohost_empty_players'));
        return;
      }

      items = [];

      // Обрабатываем каждый плеер
      apiResponse.data.forEach(function (player, index) {
        // Основной плеер
        items.push({
          title: player.type,
          quality: 'Оригинал',
          info: '',
          iframeUrl: player.iframeUrl,
          player: player
        });

        // Озвучки (если есть)
        if (player.translations && player.translations.length > 0) {
          player.translations.forEach(function (translation) {
            items.push({
              title: player.type + ' — ' + translation.title,
              quality: translation.title,
              info: '',
              iframeUrl: translation.iframeUrl,
              player: player,
              translation: translation
            });
          });
        }
      });

      this.append(items);
    };

    this.append = function (data) {
      var _this = this;

      data.forEach(function (element) {
        var item = Lampa.Template.get('online_folder', element);

        item.on('hover:focus', function () {
          last = item[0];
          scroll.update($(last), true);
        });

        item.on('hover:enter', function () {
          _this.openPlayer(element);
        });

        body.append(item);
      });

      scroll.append(body);
      this.activity.toggle();
    };

    this.openPlayer = function (element) {
      // Создаем HTML страницу с iframe
      var htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="referrer" content="no-referrer-when-downgrade">
    <title>${element.title} - Kinobox Player</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #000; overflow: hidden; }
        iframe {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            border: none;
        }
        .loading {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #fff;
            font-family: Arial, sans-serif;
            font-size: 18px;
        }
    </style>
</head>
<body>
    <div class="loading">Загрузка плеера...</div>
    <iframe src="${element.iframeUrl}" allowfullscreen frameborder="0" scrolling="no" onload="document.querySelector('.loading').style.display='none'"></iframe>
</body>
</html>`;

      // Создаем Blob URL
      var blob = new Blob([htmlContent], { type: 'text/html' });
      var blobUrl = URL.createObjectURL(blob);

      // Открываем в новой вкладке
      window.open(blobUrl, '_blank');

      // Освобождаем URL через 5 секунд (даем время на загрузку)
      setTimeout(function () {
        URL.revokeObjectURL(blobUrl);
      }, 5000);
    };

    this.empty = function (msg) {
      var empty = Lampa.Template.get('list_empty');

      if (msg) {
        empty.find('.empty__descr').text(msg);
      }

      scroll.append(empty);
      this.activity.loader(false);
      this.activity.toggle();
    };

    this.start = function () {
      Lampa.Controller.add('content', {
        toggle: function () {
          Lampa.Controller.collectionSet(scroll.render(), body);
          Lampa.Controller.collectionFocus(last || false, scroll.render());
        },
        left: function () {
          if (Navigator.canmove('left')) Navigator.move('left');
          else Lampa.Controller.toggle('menu');
        },
        up: function () {
          if (Navigator.canmove('up')) Navigator.move('up');
          else Lampa.Controller.toggle('head');
        },
        down: function () {
          Navigator.move('down');
        },
        right: function () {
          Navigator.move('right');
        },
        back: function () {
          Lampa.Activity.backward();
        }
      });

      Lampa.Controller.toggle('content');
    };

    this.pause = function () { };

    this.stop = function () { };

    this.render = function () {
      return html;
    };

    this.destroy = function () {
      network.clear();
      scroll.destroy();
      html.remove();
      body.remove();
      items = null;
    };
  }

  if (window.Lampa) {
    startPlugin();
  }

})();
