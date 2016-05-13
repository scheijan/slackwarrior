var request = require('request-promise');
var cheerio = require('cheerio');
var Promise = require('bluebird');

var init = function (controller) {

  controller.hears(['shownotes (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var channelName = message.match[1];
    bot.botkit.log('creating shownotes for channel ' + channelName);
    var channelID = controller.getChannelID(channelName);
    var channel = controller.getChannelByID(channelID);
    // bot.botkit.log('channelID', channelID);
    bot.api.pins.list({channel: channelID}, function (err, res) {
      if (!err) {
        // controler.storage.shownotes = [];
        bot.botkit.log('found ' + res.items.length + ' pins in ' + channelID);
        pins2osf(res.items, message, bot, channel);
        
      } else {
        bot.botkit.log('pins failed', err);
      }
      
    })
  });



  controller.hears(['links (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var channelName = message.match[1];
    bot.botkit.log('creating shownotes for channel ' + channelName);
    var channelID = controller.getChannelID(channelName);
    var errorMessage = 'Ummm... Sorry, but that did not work as expected... Did I maybe read that wrong? Which channel did you want me get the shownotes for? I read "' + channelName + '", but my eyes aren\'t what they used to be... :eyeglasses:';
    controller.storage.channels.get(channelID, function(err, channel) {
      if (!channel) {
        bot.botkit.log('getting channel failed', err, channel);
        bot.reply(message, errorMessage);
      } else {
        if (channel.links && channel.links.length > 0) {
          bot.reply(message, 'foo' + channel.links);
        } else {
          bot.reply(message, 'I\'m sorry, but I can\'t find any links for ' + channelName);
          
        }
      }
    });
  });



  controller.hears(['start listening to (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var channelName = message.match[1];
    bot.botkit.log('listening to channel ' + channelName);
    var channelID = controller.getChannelID(channelName);
    var errorMessage = 'Ummm... Sorry, but that did not work as expected... Did I maybe read that wrong? Which channel did you want me to listen to? I read "' + channelName + '", but my eyes aren\'t what they used to be... :eyeglasses:';
    // bot.botkit.log('channelID', channelID);
    controller.storage.channels.get(channelID, function(err, channel) {
      if (!channel) {
        bot.botkit.log('getting channel failed', err, channel);
        bot.reply(message, errorMessage);
      } else {
        if (channel.listening) {
          bot.reply(message, 'I\'m already listening to ' + channelName + '. :microphone:');
        } else {
          channel.listening = true;
          controller.storage.channels.save(channel, function(err, id) {
            if (err) {
              bot.reply(message, errorMessage);
            } else {
              bot.reply(message, 'Got it. I will listen to ' + channelName + ' from now on, until someone asks me to stop again. :microphone:');
            }
          });
        }
      }
    });
  });


  controller.hears(['stop listening to (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var channelName = message.match[1];
    bot.botkit.log('listening to channel ' + channelName);
    var channelID = controller.getChannelID(channelName);
    var errorMessage = 'Ummm... Sorry, but that did not work as expected... Did I maybe read that wrong? Which channel did you want me to stop listening to? I read "' + channelName + '", but my eyes aren\'t what they used to be... :eyeglasses:';
    // bot.botkit.log('channelID', channelID);
    controller.storage.channels.get(channelID, function(err, channel) {
      if (!channel) {
        bot.botkit.log('getting channel failed', err, channel);
        bot.reply(message, errorMessage);
      } else {
        if (channel.listening) {
          channel.listening = false;
          controller.storage.channels.save(channel, function(err, id) {
            if (err) {
              bot.reply(message, errorMessage);
            } else {
              bot.reply(message, 'Ok, ok, I will stop listening to ' + channelName + '. And yes, no worries, I know the rules: What happens in ' + channelName + ' stays in ' + channelName + ' :hear_no_evil:');
              // start conversation
            }
          });
        } else {
          bot.reply(message, 'Well, I was not listening to ' + channelName + ' so far. But if you want me to, you just have to ask me to start... :robot_face:');
        }
      }
    });
  });


  controller.hears(['(.*)'], 'ambient', function(bot, message) {
    var channelID = message.channel;
    controller.storage.channels.get(channelID, function(err, channel) {
      if (!err) {
        if (channel.listening) {
          if (!channel.links) {
            channel.links = [];
          }

          var text = message.text;
          if (text.indexOf('<') > -1 && text.indexOf('>') > -1 && text.indexOf('.') > -1) {
            //  extract the url from the message
            var re = new RegExp("\\<([^\\<\\>]+\\.+[^\\<\\>]+)\\>");
            var url = text.match(re);
            if (url && url.length > 0) {
              url = url[1]
              if (url.indexOf('|') > -1) {
                url = url.split('|')[0]
              }

              channel.links.push(url);
              controller.storage.channels.save(channel, function(err, id) {
                if (err) {
                  bot.botkit.log('error saving link', err, id);
                } else {
                  bot.botkit.log('saved a link', url);
                  // start conversation
                }
              });
            }
          }
        }
      } else {
        bot.botkit.log('getting channel failed', err, channel);
      }
    });
  });


  

  function pins2osf(pins, message, bot, channel) {
    var urls = [];
    var promises = [];
    // loop over all pins and fill an array with promises of get requests to the urls
    for (var i = pins.length -1; i >= 0; i--) {
      var e = pins[i];
      if (e.type && e.type === 'message') {
        var text = e.message.text;
        if (text.indexOf('<') > -1 && text.indexOf('>') > -1 && text.indexOf('.') > -1) {
          //  extract the url from the message
          var re = new RegExp("\\<([^\\<\\>]+\\.+[^\\<\\>]+)\\>");
          var url = text.match(re);
          if (url && url.length > 0) {
            url = url[1]
            if (url.indexOf('|') > -1) {
              url = url.split('|')[0]
            }
            // push the url to an array 
            urls.push(url);
            // request will return a promise, add that to another array
            // set simple = false to prevent rejections of the promise for ... reasons
            promises.push(request({uri: url, simple: false, timeout: 10000}));
          }
        }
      }
    }

    bot.botkit.log('got ' + urls.length + ' URLs to check');
    bot.reply(message, 'Please hold on just a second while I get some titles for those ' + urls.length + ' URLs you got there...')

    // once all promises are resolved
    Promise.all(promises).then(function (results) {
      var result = '';
      for (var i = 0; i <= results.length -1; i++) {
        var res = results[i];
        var title;
        // try to extract the title from the body of the response
        try {
          $ = cheerio.load(res, {normalizeWhitespace: true});
          var title = $('title').first().text();
          
        // if we get an error from cheerio set a default title
        } catch(err) {
          bot.botkit.log('cheerio error', err);
          title = '__MISSING_TITLE__';
        }

        // if we still have no title here set a default
        if (!title) {
          title = '__MISSING_TITLE__';
        }
        // concat the title and the corresponding URL and add that to the result
        var line = title + ' <' + urls[i] + '>\n';
        bot.botkit.log('adding line', line);
        result = result + line;
      }

      // upload the result as a snipped to the channel the bot was asked in
      var d = new Date();
      var date = d.toLocaleString();
      bot.api.files.upload({
                      content: result,
                      channels: message.channel,
                      title: 'Shownotes for #' + channel.name + ' on ' + date
                  }, function (err, res) {
                        // bot.botkit.log('res', res);
                        if (err) {
                          bot.botkit.log('err', err);
                          bot.reply(message, 'There was some problem uploading the shownotes file, please contact @scheijan and kick his ass...')
                        } else {
                          bot.reply(message, 'There you are, I hope this helps :robot_face:')
                        }
                        
                  })

     }).catch(function (err) {
      bot.botkit.log('promise error', err);
      bot.reply(message, 'There was some problem getting the titles for the shownotes, please contact @scheijan and kick his ass...')
    })
  }
}

exports.init = init;

