'use strict'
const request = require('request');
const cheerio = require('cheerio');
const Promise = require('bluebird');
Promise.promisifyAll(require('request'));

const getErrorMessage = (channelName) =>
  `Ummm... Sorry, but that did not work as expected... Did I maybe read that wrong? Which channel did you mean? I read "${channelName}", but my eyes aren't what they used to be... :eyeglasses:`;

const init = function (controller) {
  // get a channel ID from a Slack channel link
  function cleanChannelID(cID) {
    let channelID = cID;
    channelID = channelID.replace('#', '');
    channelID = channelID.replace('<', '');
    channelID = channelID.replace('>', '');
    return channelID
  }

  // resolve a list of promises and create shownotes from the result
  function promises2shownotes(bot, message, urls, promises, channel, mode) {
    Promise.all(promises.map((promise) => promise.reflect())).then((results) => {
      bot.botkit.log('got promises to check', results.length);
      let result = '';
      for (let i = 0; i <= results.length - 1; i++) {
        const inspection = results[i];
        let title;
        // try to extract the title from the body of the response
        try {
          const res = inspection.value();
          const $ = cheerio.load(res.body, { normalizeWhitespace: true });
          title = $('title').first().text();

        // if we get an error from cheerio set a default title
        } catch (err) {
          bot.botkit.log('cheerio error', err);
          title = '__MISSING_TITLE__';
        }

        // if we still have no title here set a default
        if (!title) {
          title = '__MISSING_TITLE__';
        }
        // concat the title and the corresponding URL and add that to the result

        const url = urls[i];
        let line;
        if (url.indexOf('SHOWNOTE:') > -1) {
          line = url.split('SHOWNOTE:')[1]
        } else {
          line = `${title} <${urls[i]}>\n`
        }

        // bot.botkit.log('adding line', line);
        result = result + line;
      }

      // upload the result as a snipped to the channel the bot was asked in
      const d = new Date();
      const date = d.toLocaleString();
      bot.api.files.upload({
        content: result,
        channels: message.channel,
        title: `Shownotes from ${mode} for #${channel.name} on ${date}`,
      }, (err) => {
        // bot.botkit.log('res', res);
        if (err) {
          bot.botkit.log('err', err);
          bot.reply(message, 'There was some problem uploading the shownotes file, please contact @scheijan and kick his ass...')
        } else {
          // if (mode == 'pinned items')
            // bot.reply(message, 'There you are, I hope this helps :robot_face:')
        }
      })
    }).catch((err) => {
      bot.botkit.log('promise error', err);
      bot.reply(message, 'There was some problem getting the titles for the shownotes, please contact @scheijan and kick his ass...')
    })
  }

  // collect saved links from a channel and create an array of promises
  function urls2osf(bot, message, channel) {
    const urls = channel.links;
    const promises = [];
    // loop over all pins and fill an array with promises of get requests to the urls
    for (let i = 0; i <= urls.length - 1; i++) {
      promises.push(request.getAsync({ uri: urls[i], simple: false, timeout: 10000 }));
    }

    bot.botkit.log('got URLs to check', urls.length);

    promises2shownotes(bot, message, urls, promises, channel, 'pasted links')
  }

  // collect pinned items with links from a channel and create shownotes from the result
  function pins2osf(bot, message, channel, pins) {
    const urls = [];
    const promises = [];
    // loop over all pins and fill an array with promises of get requests to the urls
    for (let i = 0; i <= pins.length - 1; i++) {
      const e = pins[i];
      if (e.type && e.type === 'message') {
        const text = e.message.text;
        if (text.indexOf('<') > -1 && text.indexOf('>') > -1 && text.indexOf('.') > -1) {
          //  extract the url from the message
          const re = new RegExp('\\<([^\\<\\>]+\\.+[^\\<\\>]+)\\>');
          let url = text.match(re);
          if (url && url.length > 0) {
            url = url[1]
            if (url.indexOf('|') > -1) {
              url = url.split('|')[0]
            }
            // push the url to an array
            urls.push(url);
            // request will return a promise, add that to another array
            // set simple = false to prevent rejections of the promise for ... reasons
            promises.push(request.getAsync({ uri: url, simple: true, timeout: 10000 }));
          }
        }
      }
    }

    bot.botkit.log('got URLs to check', urls.length);

    promises2shownotes(bot, message, urls, promises, channel, 'pinned items')
  }

  // generate shownotes from saved links and pinned items for a given channel
  function shownotes(bot, message, channelName) {
    bot.botkit.log('creating shownotes for channel', channelName);
    bot.reply(message, `Please hold on just a second while I try to generate the shownotes for ${channelName}`)
    const channelID = cleanChannelID(channelName)
    const channel = controller.getChannelByID(channelID);

    // if the bot saved any links generate shownotes from those
    controller.storage.channels.get(channelID, (err, resChannel) => {
      if (!resChannel) {
        bot.botkit.log('getting channel failed', err, channel);
        bot.reply(message, getErrorMessage(channelName));
      } else {
        if (channel.links && channel.links.length > 0) {
          urls2osf(bot, message, resChannel)
        } else {
          bot.reply(message, `I'm sorry, but I can't find any saved links for ${channelName}`);
        }
      }
    });

    // if there are pinned items in the channel also generate shownotes from those
    bot.api.pins.list({ channel: channelID }, (err, res) => {
      if (!err) {
        const pinsLength = res.items.length;
        // bot.botkit.log('found ' + pinsLength + ' pins in ' + channelID);
        if (pinsLength > 0) {
          pins2osf(bot, message, channel, res.items);
        } else {
          bot.reply(message, `I'm sorry, but I can't find any pinned items for ${channelName}`);
        }
      } else {
        bot.botkit.log('pins failed', err);
      }
    })
  }

  // command to generate shownotes
  controller.hears(['shownotes (.*)'], 'direct_message,direct_mention,mention', (bot, message) => {
    const channelName = message.match[1];
    shownotes(bot, message, channelName);
  });

  // command to add a shownote to the list of saved links
  controller.hears(['shownote (.*)'], 'direct_mention,mention', (bot, message) => {
    const channelID = message.channel;
    // get the channel from the storag
    controller.storage.channels.get(channelID, (err, c) => {
      const channel = c;
      if (!err) {
        // if we're supposed to listen to this channel
        if (channel.listening) {
          // if there are no saved links yet, initialize an empty array for them
          if (!channel.links) {
            channel.links = [];
          }

          // prefix the line so we can find it again later
          const shownote = `SHOWNOTE:${message.match[1]}`;

          // add the line to the saved links
          channel.links.push(shownote);
          bot.botkit.log('saved a shownote', shownote);

          // save the list of saved links back to storage
          controller.storage.channels.save(channel, (saveErr, id) => {
            if (saveErr) {
              bot.botkit.log('error saving link', err, id);
            } else {
              bot.botkit.log(`saved ${channel.links.length} links`);
              bot.api.reactions.add({
                timestamp: message.ts,
                channel: message.channel,
                name: 'ballot_box_with_check',
              }, (reactionErr) => {
                if (reactionErr) {
                  bot.botkit.log('failed to add reaction', err);
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

  // command to have the bort start saving links in a channel
  controller.hears(['start listening to (.*)'], 'direct_message,direct_mention,mention', (bot, message) => {
    const channelName = message.match[1];
    bot.botkit.log('trying to listen to channel', channelName);
    const channelID = cleanChannelID(channelName)

    // get the channel from the storage
    controller.storage.channels.get(channelID, (err, c) => {
      const channel = c;
      if (!channel) {
        bot.botkit.log('getting channel failed', err, channel);
        bot.reply(message, getErrorMessage(channelName));
      } else {
        // if we're already listening to the channel, tell the user
        if (channel.listening) {
          bot.reply(message, `I'm already listening to ${channelName}. :microphone:`);
        // if not, set the listening flag and save the channel back to storage
        } else {
          channel.listening = true;
          controller.storage.channels.save(channel, (saveErr) => {
            if (saveErr) {
              bot.reply(message, getErrorMessage(channelName));
            } else {
              bot.reply(message, `Got it. I will listen to ${channelName} from now on, until someone asks me to \`stop\` again. :microphone:`);
            }
          });
        }
      }
    });
  });

  // command to have the bort stop saving links in a channel
  controller.hears(['stop listening to (.*)'], 'direct_message,direct_mention,mention', (bot, message) => {
    const channelName = message.match[1];
    const channelID = cleanChannelID(channelName)
    // get the channel from storage
    controller.storage.channels.get(channelID, (geterr, c) => {
      const channel = c;
      if (!channel) {
        bot.botkit.log('getting channel failed', geterr, channel);
        bot.reply(message, getErrorMessage(channelName));
      } else {
        // if we were listening to the channel
        if (channel.listening) {
          // remove the flag
          channel.listening = false;
          // and save the channel back to storage
          controller.storage.channels.save(channel, (saveErr) => {
            if (saveErr) {
              bot.reply(message, getErrorMessage(channelName));
            } else {
              bot.reply(message, `Ok, ok, I will stop listening to ${channelName}. And yes, no worries, I know the rules: What happens in ${channelName} stays in ${channelName} :hear_no_evil:`);
              // ask the user whether they want the shownotes generated right now
              bot.startConversation(message, (err, convo) => {
                if (!err) {
                  convo.ask(`Do you want me to create the shownotes for ${channelName}?`, [
                    {
                      pattern: bot.botkit.utterances.yes,
                      callback: (response, cconvo) => {
                        shownotes(bot, message, channelName);
                        cconvo.next();
                      },
                    },
                    {
                      pattern: bot.botkit.utterances.no,
                      callback: (response, cconvo) => {
                        cconvo.say(`Alright, as you wish. If you change your mind later just ask me for \`shownotes ${channelName}\` and I will get them for you.`);
                        cconvo.next();
                      },
                    },
                    {
                      default: true,
                      callback: (response, cconvo) => {
                        cconvo.repeat();
                        cconvo.next();
                      },
                    },
                  ]);
                }
              })
            }
          });
        // if we weren't listening to the channel, tell the user
        } else {
          bot.reply(message, `Well, I was not listening to ${channelName} so far. But if you want me to, you just have to ask me to \`start\`... :robot_face:`);
        }
      }
    });
  });

  // listen to every message in case the bot is "listening" to the channel
  controller.hears(['(.*)'], 'ambient', (bot, message) => {
    const channelID = message.channel;
    controller.storage.channels.get(channelID, (err, c) => {
      const channel = c;
      if (!err) {
        // if we're supposed to listen to the channel
        if (channel.listening) {
          // if there are no saved links yet, initialize an empty array for them
          if (!channel.links) {
            channel.links = [];
          }

          const text = message.text;
          // if the message contains a link
          if (text.indexOf('<') > -1 && text.indexOf('>') > -1 && text.indexOf('.') > -1) {
            // extract the url from the message
            const re = new RegExp('\\<([^\\<\\>]+\\.+[^\\<\\>]+)\\>', 'gi');
            const urls = text.match(re);
            // bot.botkit.log('urls', urls);
            if (urls && urls.length > 0) {
              for (let i = 0; i <= urls.length - 1; i++) {
                let url = urls[i];
                // remove the markup
                if (url.indexOf('|') > -1) {
                  url = url.split('|')[0]
                }
                if (url.indexOf('>') > -1) {
                  url = url.split('>')[0]
                }
                if (url.indexOf('<') > -1) {
                  url = url.split('<')[1]
                }

                // add the link to the list of saved links
                bot.botkit.log('working on link', url);
                if (channel.links.indexOf(url) < 0) {
                  channel.links.push(url);
                  bot.botkit.log('saved a link', url);
                }
              }

              // save the channel with the new link back to storage
              controller.storage.channels.save(channel, (saveErr, id) => {
                if (saveErr) {
                  bot.botkit.log('error saving link', err, id);
                } else {
                  bot.botkit.log('saved links', channel.links.length);
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

  // command to clear all pinned items in a given channel
  controller.hears(['clear pins in (.*)'], 'direct_message,direct_mention,mention', (bot, message) => {
    const channelName = message.match[1];
    const channelID = cleanChannelID(channelName)

    bot.reply(message, 'Please be very careful with this command, removing pinned items cannot be undone :bangbang:')
    bot.startConversation(message, (convoErr, convo) => {
      // verify the user actually wants that
      convo.ask(`Are you sure you want me to remove all pinned items in ${channelName}?`, [
        {
          pattern: bot.utterances.yes,
          callback: (response, yconvo) => {
            yconvo.say('As you wish...');
            // list all pins
            bot.api.pins.list({ channel: channelID }, (err, res) => {
              if (!err) {
                // controler.storage.shownotes = [];
                bot.botkit.log(`found ${res.items.length} pins to remove in ${channelName}`);
                yconvo.say(`Deleting ${res.items.length} pinned items in ${channelName}`);
                for (let i = res.items.length - 1; i >= 0; i--) {
                  const pin = res.items[i];
                  bot.botkit.log('going to remove', pin);

                  // if this was a pinned file, we have to pass the file.id
                  if (pin.file && pin.file.id) {
                    bot.api.pins.remove({ channel: channelID, file: pin.file.id }, (pinsErr) => {
                      if (pinsErr) {
                        bot.botkit.log('removing pin failed', pinsErr);
                      }
                    })
                  // if it was a pinned message, we have to pass the message.ts
                  } else {
                    bot.api.pins.remove({ channel: channelID, timestamp: pin.message.ts }, (pinsErr) => {
                      if (pinsErr) {
                        bot.botkit.log('removing pin failed', pinsErr);
                      }
                    })
                  }
                }
                yconvo.say(':heavy_check_mark:');
                yconvo.next();
              } else {
                bot.botkit.log('getting pins failed', err);
              }
            })
          },
        },
        {
          pattern: bot.utterances.no,
          callback: (response, nconvo) => {
            nconvo.say('Too late, I\'m deleting them anyway...');
            nconvo.say('Deleting...');
            nconvo.say('Nah, I was just kidding, your pinned items are safe :black_joker:');
            nconvo.next();
          },
        },
        {
          default: true,
          callback: (response, dconvo) => {
            dconvo.say('Hm? What did you say? I\'m sorry, I didn\'t understand you... I guess I will take that as a "yes" and delete all your pinned items...');
            dconvo.say('Deleting...');
            dconvo.say('Nah, I was just kidding, your pinned items are safe :black_joker:');
            dconvo.next();
          },
        },
      ]);
    });
  });

  // command to reset the list of saved links for a given channel
  controller.hears(['clear links in (.*)'], 'direct_message,direct_mention,mention', (bot, message) => {
    const channelName = message.match[1];
    const channelID = cleanChannelID(channelName)

    bot.reply(message, 'Please be very careful with this command, deleting saved links cannot be undone :bangbang:')
    bot.startConversation(message, (err, convo) => {
      // verify the user actually wants that
      convo.ask(`Are you sure you want me to remove all saved links in ${channelName}?`, [
        {
          pattern: bot.utterances.yes,
          callback: (response, yconvo) => {
            // get the channel from storage
            controller.storage.channels.get(channelID, (geterr, c) => {
              const channel = c;
              if (!channel) {
                bot.botkit.log('getting channel failed', err, channel);
                bot.reply(message, 'I did not find that channel in my dossier :confused:');
              // if there were links
              } else if (channel.links && channel.links.length > 0) {
                // reset the list
                channel.links = [];
                // and save the channel back to storage
                controller.storage.channels.save(channel, (saveErr) => {
                  if (saveErr) {
                    yconvo.say(`I was not able to delete the links in channel ${channelName} :confused:`);
                  } else {
                    yconvo.say(`Ok, deleted all saved links in ${channelName}`);
                  }
                });
              } else {
                bot.reply(message, `I'm sorry, but I can't find any saved links for ${channelName}`);
              }
            });
            yconvo.next()
          },
        },
        {
          pattern: bot.utterances.no,
          callback: (response, nconvo) => {
            nconvo.say('Too late, I\'m deleting them anyway...');
            nconvo.say('Deleting...');
            nconvo.say('Nah, I was just kidding, your saved links are safe :black_joker:');
            nconvo.next();
          },
        },
        {
          default: true,
          callback: (response, defaultconvo) => {
            defaultconvo.say('Hm? What did you say? I\'m sorry, I didn\'t understand you... I guess I will take that as a "yes" and delete all your saved links...');
            defaultconvo.say('Deleting...');
            defaultconvo.say('Nah, I was just kidding, your saved links are safe :black_joker:');
            defaultconvo.next();
          },
        },
      ]);
    });
  });
}

exports.init = init;
