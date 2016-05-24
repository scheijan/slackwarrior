var request = require('request');
var cheerio = require('cheerio');
var Promise = require('bluebird');
Promise.promisifyAll(require("request"));

var init = function (controller) {
 
  controller.hears(['shownotes (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var channelName = message.match[1];
    shownotes(bot, message, channelName);
  });

  controller.hears(['shownote (.*)'], 'direct_mention,mention', function(bot, message) {
    var channelID = message.channel;
    controller.storage.channels.get(channelID, function(err, channel) {
      if (!err) {
        if (channel.listening) {
          if (!channel.links) {
            channel.links = [];
          }

          var shownote = 'SHOWNOTE:' + message.match[1];
      
          channel.links.push(shownote);
          bot.botkit.log('saved a shownote', shownote);

          controller.storage.channels.save(channel, function(err, id) {
            if (err) {
              bot.botkit.log('error saving link', err, id);
            } else {
              bot.botkit.log('saved ' + channel.links.length + ' links');
              bot.api.reactions.add({
                timestamp: message.ts,
                channel: message.channel,
                name: 'ballot_box_with_check',
                }, function(err, res) {
                if (err) {
                  bot.botkit.log('failed to add ' + reaction + ' reaction', err);
                }
              });              
            }
          });
            
          
        } else {
          bot.reply(message, 'I\'m not logging links in this channel right now. If you want me to `start listening` just tell me...')
        }
      } else {
        bot.botkit.log('getting channel failed', err, channel);
      }
    });
  });

  controller.hears(['start listening to (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var channelName = message.match[1];
    bot.botkit.log('trying to listen to channel ' + channelName);
    // var channelID = controller.getChannelID(channelName);
    var channelID = cleanChannelID(channelName)
    var errorMessage = 'Ummm... Sorry, but that did not work as expected... Did I maybe read that wrong? Which channel did you want me to listen to? I read "' + channelName + '", but my eyes aren\'t what they used to be... :eyeglasses:';
    bot.botkit.log('channelID', channelID);
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
    var channelID = cleanChannelID(channelName)
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
              
              bot.startConversation(message, function(err, convo) {
                if (!err) {
                  convo.ask('Do you want me to create the shownotes for ' + channelName + '?', [
                    {
                      pattern: bot.botkit.utterances.yes,
                      callback: function(response, convo) {
                        // since no further messages are queued after this,
                        // the conversation will end naturally with status == 'completed'
                        shownotes(bot, message, channelName);
                        convo.next();
                      }
                    },
                    {
                      pattern: bot.botkit.utterances.no,
                      callback: function(response, convo) {
                        convo.say('Alright, as you wish. If you change your mind later just ask me for `shownotes ' + channelName + '` and I will get them for you.');
                        convo.next();
                      }
                    },
                    {
                      default: true,
                      callback: function(response, convo) {
                        convo.repeat();
                        convo.next();
                      }
                    }
                  ]);

                }
              })


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
            var re = new RegExp("\\<([^\\<\\>]+\\.+[^\\<\\>]+)\\>", 'gi');
            var urls = text.match(re);
            // bot.botkit.log('urls', urls);
            if (urls && urls.length > 0) {
              for (var i = 0; i <= urls.length -1; i++) {
                var url = urls[i];
                bot.botkit.log('working on link', url);
                if (url.indexOf('|') > -1) {
                  url = url.split('|')[0]
                }
                if (url.indexOf('>') > -1) {
                    url = url.split('>')[0]
                }
                if (url.indexOf('<') > -1) {
                    url = url.split('<')[1]
                }


                bot.botkit.log('working on link', url);
                if (channel.links.indexOf(url) < 0) {
                  channel.links.push(url);
                  bot.botkit.log('saved a link', url);
                }
              }

              controller.storage.channels.save(channel, function(err, id) {
                if (err) {
                  bot.botkit.log('error saving link', err, id);
                } else {
                  bot.botkit.log('saved ' + channel.links.length + ' links');
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

  controller.hears(['clear pins in (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
      var channelName = message.match[1];
      var channelID = cleanChannelID(channelName)
      bot.botkit.log('found ID ' + channelID + ' for  ' + channelName);

      bot.reply(message, 'Please be very careful with this command, removing pinned items cannot be undone :bangbang:')
      bot.startConversation(message, function(err, convo) {
        convo.ask('Are you sure you want me to remove all pinned items in ' + channelName + '?', [
          {
            pattern: bot.utterances.yes,
            callback: function(response, convo) {
              convo.say('As you wish...');

              bot.api.pins.list({channel: channelID}, function (err, res) {
                if (!err) {
                  // controler.storage.shownotes = [];
                  bot.botkit.log('found ' + res.items.length + ' pins to remove in ' + channelName);
                  convo.say('Deleting ' + res.items.length + ' pinned items in ' + channelName);
                  for (var i = res.items.length - 1; i >= 0; i--) {
                    var pin = res.items[i];
                    bot.botkit.log('going to remove', pin);

                    if (pin.file && pin.file.id) {
                      bot.api.pins.remove({channel: channelID, file: pin.file.id}, function (err, res) {
                      if (err) {
                        bot.botkit.log('removing pin failed', err);
                      }
                    })
                    } else {
                      bot.api.pins.remove({channel: channelID, timestamp: pin.message.ts}, function (err, res) {
                        if (err) {
                          bot.botkit.log('removing pin failed', err);
                        }
                      })
                    }
                    
                  }
                  convo.say(':heavy_check_mark:');
                  convo.next(); 
                } else {
                  bot.botkit.log('getting pins failed', err);
                }
              })
            }
          },
          {
            pattern: bot.utterances.no,
            callback: function(response, convo) {
              convo.say('Too late, I\'m deleting them anyway...');
              convo.say('Deleting...');
              convo.say('Nah, I was just kidding, your pinned items are safe :black_joker:');
              convo.next();
            }
          },
           {
            default: true,
            callback: function(response, convo) {
              convo.say('Hm? What did you say? I\'m sorry, I didn\'t understand you... I guess I will take that as a "yes" and delete all your pinned items...');
              convo.say('Deleting...');
              convo.say('Nah, I was just kidding, your pinned items are safe :black_joker:');
              convo.next();
            }
          }
        ]);
      });
  });

  controller.hears(['clear links in (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var channelName = message.match[1];
    var channelID = cleanChannelID(channelName)
    bot.botkit.log('found ID ' + channelID + ' for  ' + channelName);

    bot.reply(message, 'Please be very careful with this command, deleting saved links cannot be undone :bangbang:')
    bot.startConversation(message, function(err, convo) {

      convo.ask('Are you sure you want me to remove all saved links in ' + channelName + '?', [
        {
          pattern: bot.utterances.yes,
          callback: function(response, convo) {
            controller.storage.channels.get(channelID, function(err, channel) {
              if (!channel) {
                bot.botkit.log('getting channel failed', err, channel);
                bot.reply(message, 'I did not find that channel in my dossier :confused:');
              } else if (channel.links && channel.links.length > 0) {
                  channel.links = [];
                  controller.storage.channels.save(channel, function(err, id) {
                    if (err) {
                      convo.say('I was not able to delete the links in channel ' + channelName + ' :confused:');
                    } else {
                      convo.say('Ok, deleted all saved links in ' + channelName );
                    }
                  });
              } else {
                bot.reply(message, 'I\'m sorry, but I can\'t find any saved links for ' + channelName);
              }
            });
            convo.next()
          }
        },
      {
        pattern: bot.utterances.no,
        callback: function(response, convo) {
            bot.botkit.log('a no is a no', convo)
            convo.say('Too late, I\'m deleting them anyway...');
            convo.say('Deleting...');
            convo.say('Nah, I was just kidding, your saved links are safe :black_joker:');
            convo.next();
        }
      },
        {
          default: true,
          callback: function(response, convo) {
              convo.say('Hm? What did you say? I\'m sorry, I didn\'t understand you... I guess I will take that as a "yes" and delete all your saved links...');
              convo.say('Deleting...');
              convo.say('Nah, I was just kidding, your saved links are safe :black_joker:');
              convo.next();
          }
        }
      ]);
    });
  });


  function cleanChannelID(channelID) {
    channelID = channelID.replace('#','');
    channelID = channelID.replace('<','');
    channelID = channelID.replace('>','');
    return channelID
  }

  function shownotes(bot, message, channelName) {
    bot.botkit.log('creating shownotes for channel ' + channelName);
    bot.reply(message, 'Please hold on just a second while I try to generate the shownotes for ' + channelName)
    var channelID = cleanChannelID(channelName)
    var channel = controller.getChannelByID(channelID);
    var errorMessage = 'Ummm... Sorry, but that did not work as expected... Did I maybe read that wrong? Which channel did you want me get the shownotes for? I read "' + channelName + '", but my eyes aren\'t what they used to be... :eyeglasses:';

    // if the bot saved any links generate shownotes from those
    controller.storage.channels.get(channelID, function(err, channel) {
      if (!channel) {
        bot.botkit.log('getting channel failed', err, channel);
        bot.reply(message, errorMessage);
      } else {
        if (channel.links && channel.links.length > 0) {
          urls2osf(bot, message, channel)
        } else {
          bot.reply(message, 'I\'m sorry, but I can\'t find any saved links for ' + channelName);
        }
      }
    });

    // if there are pinned items in the channel also generate shownotes from those
    bot.api.pins.list({channel: channelID}, function (err, res) {
      if (!err) {
        var pinsLength = res.items.length;
        bot.botkit.log('found ' + pinsLength + ' pins in ' + channelID);
        if (pinsLength > 0) {
          pins2osf(bot, message, channel, res.items);  
        } else {
          bot.reply(message, 'I\'m sorry, but I can\'t find any pinned items for ' + channelName);
        }        
      } else {
        bot.botkit.log('pins failed', err);
      }
    })
  }
  
  function urls2osf(bot, message, channel) {
    var urls = channel.links;
    var promises = [];
    // loop over all pins and fill an array with promises of get requests to the urls
    for (var i = 0; i <= urls.length -1; i++) {
      promises.push(request.getAsync({uri: urls[i], simple: false, timeout: 10000}));
    }

    bot.botkit.log('got ' + urls.length + ' URLs to check');
    // bot.reply(message, 'Please hold on just a second while I get some titles for those ' + urls.length + ' URLs you got there...')

    promises2shownotes(bot, message, urls, promises, channel, 'pasted links')
  }

  function pins2osf(bot, message, channel, pins) {
    var urls = [];
    var promises = [];
    // loop over all pins and fill an array with promises of get requests to the urls
    for (var i = 0; i <= pins.length -1; i++) {
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
            promises.push(request.getAsync({uri: url, simple: true, timeout: 10000}));
          }
        }
      }
    }

    bot.botkit.log('got ' + urls.length + ' URLs to check');
    bot.botkit.log(urls);
    // bot.reply(message, 'Please hold on just a second while I get some titles for those ' + urls.length + ' URLs you got there...')


    promises2shownotes(bot, message, urls, promises, channel, 'pinned items')
  }

  function promises2shownotes(bot, message, urls, promises, channel, mode) {
    Promise.all(promises.map(function(promise) {
      return promise.reflect();
        })).then(function (results) {
      bot.botkit.log('got ' + results.length + ' promises to check');
      var result = '';
      for (var i = 0; i <= results.length -1; i++) {
        var inspection = results[i];
        var title;
        // try to extract the title from the body of the response
        try {
          var res = inspection.value();
          $ = cheerio.load(res.body, {normalizeWhitespace: true});
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

        var url = urls[i];
        var line;
        if (url.indexOf('SHOWNOTE:') > -1) {
          line = url.split('SHOWNOTE:')[1]
        } else {
          line = title + ' <' + urls[i] + '>\n';  
        }
        
        // bot.botkit.log('adding line', line);
        result = result + line;
        
      }

      // upload the result as a snipped to the channel the bot was asked in
      var d = new Date();
      var date = d.toLocaleString();
      bot.api.files.upload({
        content: result,
        channels: message.channel,
        title: 'Shownotes from ' + mode + ' for #' + channel.name + ' on ' + date
      }, function (err, res) {
        // bot.botkit.log('res', res);
        if (err) {
          bot.botkit.log('err', err);
          bot.reply(message, 'There was some problem uploading the shownotes file, please contact @scheijan and kick his ass...')
        } else {
          // if (mode == 'pinned items')
            // bot.reply(message, 'There you are, I hope this helps :robot_face:')
        }
            
      })

     }).catch(function (err) {
      bot.botkit.log('promise error', err);
      bot.reply(message, 'There was some problem getting the titles for the shownotes, please contact @scheijan and kick his ass...')
    })
  }  
}

exports.init = init;

