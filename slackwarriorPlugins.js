'use strict'
const messages = require('./slackwarriorMessages');
const api = require('./slackwarriorAPI');

const init = function (controller) {
  // * * * conversations * * * //

  // specific help for the task commands
  function helpTaskConvo(bot, message) {
    bot.startPrivateConversation(message, (err, dm) => {
      dm.say('All commands to work with tasks start with `task`. Right now I know the following commands:')
      dm.say('`task help`, `task`, `task list`, `task add`, `task 23`, `task 23 done`, `task 23 start`, `task 23 stop`, `task 23 modify`, `task 23 annotate`')
      dm.say('You\'ll have to replace `23` with the `short_id` of the task you want to adress.')
      dm.say('You can find more information about my available commands and tasks in general at slackwarrior.scheijan.net/doc.html')
      dm.next()
    })
  }

  // general help, offer ways to get more specific help
  function helpConvo(bot, message) {
    // bot.botkit.log('helpConvo', message)
    bot.startPrivateConversation(message, (err, dm) => {
      dm.say('You\'re looking for help on how to use my services? I\'m glad you asked!');
      dm.say('I\'m Slackwarrior and I\'m here to help you manage your tasks.');
      dm.say('Luckily for me some very smart people built taskwarrior.org, a really awesome task manager, so I don\'t have to do all the hard work.');
      dm.say('And also luckily for me some other very smart people built inthe.am, which helps you sync your tasks among different devices and access them from every brower. Convenient, right?');
      dm.say('I can talk with inthe.am and list your tasks, `add` new ones and mark them completed as you work through the list.');

      // at the end of the conversation
      dm.on('end', () => {
        const answer = { channel: message.user, text: 'Please tell me if you want me to help you with the `onboarding` or tap on the :computer:\nIf you\'d like to know more about working with tasks, please message me with `task help` or just tap the :notebook: now.', as_user: true }
        bot.api.chat.postMessage(answer, (postErr, response) => {
          if (!postErr) {
            // add the computer reaction for the user to click on to get more help regarding the onboarding process
            bot.addReaction(response, 'computer')

            // add the computer notebook for the user to click on to get more help regarding tasks
            bot.addReaction(response, 'notebook')
          } else {
            bot.botkit.log('error sending message', response, postErr);
          }
        })
      })
    })
  }

  // offer help with the onboarding process and start the tokenConvo, if the user wants that
  function onboardingConvo(bot, message) {
    bot.startPrivateConversation(message, (err, convo) => {
      if (!err) {
        convo.say('If you want me to help you managing your tasks, you\'ll first need an account at inthe.am')
        convo.say('You can sign up with a google account and it\'s completely free! :free:')
        convo.say('Once you have an account there I need your "token", you can find it on inthe.am/configure under "API Access"')
        convo.say('slackwarrior.scheijan.net/apikey.png')
        convo.ask('Do you want me to add your token to my dossier now?', [
          {
            pattern: bot.botkit.utterances.yes,
            callback: (response, innerConvo) => {
              // since no further messages are queued after this,
              // the conversation will end naturally with status == 'completed'
              innerConvo.next();
              tokenConvo(bot, message);
            },
          },
          {
            pattern: bot.botkit.utterances.no,
            callback: (response, innerConvo) => {
              innerConvo.stop();
            },
          },
          {
            default: true,
            callback: (response, innerConvo) => {
              innerConvo.repeat();
              innerConvo.next();
            },
          },
        ]);
        convo.next();
        // at the end of the conversation
        convo.on('end', (innerConvo) => {
          bot.botkit.log('status', innerConvo.status)
          if (innerConvo.status === 'stopped') {
            bot.reply(message, 'Alright, as you wish. Just tell me once you have your token, so we can begin working on your tasks.');
          }
        })
      } else {
        bot.reply(message, messages.randomErrorMessage())
        bot.botkit.log('error starting onboarding convo', err)
      }
    })
  }

  // ask the user for their new token and add it to local storage
  function newTokenConvo(bot, message, u) {
    const user = u;
    bot.startPrivateConversation(message, (err, convo) => {
      if (!err) {
        convo.ask('Ok, great, to get started please tell me your inthe.am token', (response) => {
          convo.ask(`Please double check that the token is correct - do you want me to note \`${response.text}\` in my dossier?`, [
            {
              pattern: bot.botkit.utterances.yes,
              callback: (cresponse, cconvo) => {
                // since no further messages are queued after this,
                // the conversation will end naturally with status == 'completed'
                cconvo.next();
              },
            },
            {
              pattern: bot.botkit.utterances.no,
              callback: (cresponse, cconvo) => {
                // stop the conversation. this will cause it to end with status == 'stopped'
                cconvo.stop();
              },
            },
            {
              default: true,
              callback: (cresponse, cconvo) => {
                cconvo.repeat();
                cconvo.next();
              },
            },
          ]);
          convo.next();
        }, { key: 'token' }); // store the results in a field called token

        convo.on('end', (endconvo) => {
          bot.botkit.log('in convo.end', endconvo.status)
          // if the status is completed (not "stopped") the conversation ended with a "yes"
          if (endconvo.status === 'completed') {
            bot.reply(message, 'OK! I will update my dossier...');
            user.token = convo.extractResponse('token');
            // save the token the local storage
            controller.storage.users.save(user, (saveErr) => {
              if (!saveErr) {
                bot.botkit.log('added new token', message.user, user.token)
                let text = 'Got it. Your token is in my dossier and we can get started now.\n';
                text = `${text}Why don't you try it out and add a task to your list? Maybe you need some milk? Try \`task add remember the milk\`\n`
                text = `${text}And please feel to ask for \`task help\` at any time if you want me to remind you on how I can assist you with your tasks. :robot_face:`
                const answer = { channel: message.channel, text, as_user: true }
                bot.api.chat.postMessage(answer, (postErr, response) => {
                  if (!postErr) {
                    bot.addReaction(response, 'computer')
                  }
                })
              } else {
                bot.reply(message, messages.randomErrorMessage())
                bot.botkit.log('error saving user token', saveErr)
              }
            });
          // the convo did not end with status "completed"
          } else {
            // this happens if the conversation ended prematurely for some reason
            const answer = { channel: message.channel, text: 'Alright. If you want to try again please ask me about `onboarding` or just tap on the :computer:.', as_user: true }
            bot.api.chat.postMessage(answer, (postErr, response) => {
              if (!postErr) {
                bot.addReaction(response, 'computer')
              }
            })
          }
        });
      }
    })
  }

  // check whether the user already has a token in the local storage
  // if so, ask the user whether they want to see it again
  // then ask whether the user wants to add a new token
  // if so, start the newTokenConvo
  function tokenConvo(bot, message) {
    // get the user data from local storage
    controller.storage.users.get(message.user, (err, u) => {
      // if we don't know that user yet, add a new one with the Slack user ID
      let user = u;
      if (!u) {
        user = {
          id: message.user,
        }
      }
      // if the user already has a inthe.am token saved in local storage
      if (user.token && user.token !== '') {
        bot.startPrivateConversation(message, (priverr, convo) => {
          if (!priverr) {
            convo.say('Looks like I already have a token for you in my dossier.')
            convo.ask('Do you want me to show you the one I have here?', [
              {
                // yes, the user wants to see the current token
                pattern: bot.botkit.utterances.yes,
                callback: (response, showconvo) => {
                  showconvo.say(`The last token you told me was \`${user.token}\``)
                  showconvo.ask('Ok, do you want to tell me a new token now?', [
                    {
                      // yes, the user wants to add a new token to local storage now
                      pattern: bot.botkit.utterances.yes,
                      callback: (newresponse, newconvo) => {
                        // since no further messages are queued after this,
                        // the conversation will end naturally with status == 'completed'
                        newTokenConvo(bot, message, user);
                        newconvo.next();
                      },
                    },
                    {
                      // no, the user does not want to add a new token now
                      pattern: bot.botkit.utterances.no,
                      callback: (newresponse, newconvo) => {
                        // we'll just let the convo end here with status "stopped" and handle that later on
                        newconvo.stop();
                      },
                    },
                    {
                      // anything but yes and no, repeat the question
                      default: true,
                      callback: (newresponse, newconvo) => {
                        newconvo.repeat();
                        newconvo.next();
                      },
                    },
                  ])

                  convo.next();
                },
              },
              {
                // no, the user does not want to see the current token
                pattern: bot.botkit.utterances.no,
                callback: (showresponse, showconvo) => {
                  showconvo.ask('Ok, do you want to tell me a new token now?', [
                    {
                      // yes, the user wants to add a new token to local storage now
                      pattern: bot.botkit.utterances.yes,
                      callback: (response, yesconvo) => {
                        // since no further messages are queued after this,
                        // the conversation will end naturally with status == 'completed'
                        newTokenConvo(bot, message, user);
                        yesconvo.next();
                      },
                    },
                    {
                      // no, the user does not want to add a new token now
                      pattern: bot.botkit.utterances.no,
                      callback: (response, noconvo) => {
                        // we'll just let the convo end here with status "stopped" and handle that later on
                        noconvo.stop();
                      },
                    },
                    {
                      // anything but yes and no, repeat the question
                      default: true,
                      callback: (response, defaultconvo) => {
                        defaultconvo.repeat();
                        defaultconvo.next();
                      },
                    },
                  ])
                  showconvo.next()
                },
              },
              {
                // anything but yes and no, repeat the question
                default: true,
                callback: (response, dconvo) => {
                  dconvo.repeat();
                  dconvo.next();
                },
              },
            ])

            // if the conversation did not end with the user adding a new token
            convo.on('end', (econvo) => {
              if (econvo.status === 'stopped') {
                bot.reply(message, 'Alright, as you wish. If you want to change your `token` later just tell me and please feel free to ask me for `help` at any time :robot_face:');
              }
            })
          }
        })
      } else {
        // the user was not in the local storage or had no token yet
        newTokenConvo(bot, message, user)
      }
    });
  }

  // * * * event listeners * * * //

  // handle request for help with the task system
  controller.hears(['^help task', '^task help'], 'direct_message,direct_mention,mention', (bot, message) => {
    helpTaskConvo(bot, message)
  })

  // handle request for general help
  controller.hears(['^help'], 'direct_message,direct_mention,mention', (bot, message) => {
    helpConvo(bot, message)
  })

  function handleTaskCommand(bot, message) {
    let text = message.text;
    const lcText = message.text.toLowerCase();
    // task add
    if (lcText.indexOf('task add ') > -1) {
      text = text.split('task add ')[1]
      if (text && text.length > 0) {
        api.addTask(bot, message, text)
      } else {
        bot.reply(message, messages.randomTaskErrorMessage())
      }
    // if the second token is a digit
    } else if (lcText.indexOf('task ') > -1 && /^-?\d+\.?\d*$/.test(lcText.split('task ')[1].split(' ')[0])) {
      text = text.substring(5, text.length)
      api.changeTask(bot, message, text)
    // task list
    } else if (lcText.indexOf('task list') > -1) {
      api.sendAllTasks(bot, message);
    // task
    } else if (lcText === 'task') {
      api.sendTasks(bot, message);
    } else {
      bot.reply(message, messages.randomTaskErrorMessage())
    }
  }

  // handle all commands that start with "task" (except for "task help") and call their handler functions
  controller.hears(['^task'], 'direct_message,direct_mention,mention', (bot, message) => {
    handleTaskCommand(bot, message)
  });

  // handle request to the bot to introduce itself and provide ways to get help
  controller.hears(['introduce'], 'direct_message,direct_mention,mention', (bot, message) => {
    // make it look like the bot is typing and wait a couple of seconds to increase the illusion of a user
    bot.startTyping(message);
    setTimeout(() => {
      bot.reply(message, 'Well, hello everyone, I\'m Slackwarrior and I\'m here to help you manage your tasks. :notebook:')
      bot.startTyping(message);
      setTimeout(() => {
        const answer = { channel: message.channel, text: 'Please feel free to ask me for `help` at any time or just tap the :grey_question: now.', as_user: true }
        // add a question mark reaction to the message as a way for the users to get help
        bot.api.chat.postMessage(answer, (err, response) => {
          if (!err) {
            bot.addReaction(response, 'grey_question')
          } else {
            bot.botkit.log('error sending message', response, err);
          }
        })
      }, 3000)
    }, 3000)
  })

  // slackwarrior is always hard at work
  controller.hears(['hard at work'], 'direct_message,direct_mention,mention', (bot, message) => {
    bot.reply(message, 'http://tinyurl.com/craftybot-gif')
  })

  // handle a user's request for onboarding
  controller.hears(['onboarding'], 'direct_message,direct_mention,mention', (bot, message) => {
    onboardingConvo(bot, message)
  })

  // handle reactions added to the bot's messages
  controller.on('reaction_added', (bot, message) => {
    if (message.item_user === bot.identity.id && message.user !== bot.identity.id) {
      bot.botkit.log('user reaction_added to a bot message', message.reaction)
      // if it was a grey question mark, start the general help conversation
      if (message.reaction === 'grey_question') {
        helpConvo(bot, { type: 'message', user: message.user })
      // if it was a computer, start the onboarding help
      } else if (message.reaction === 'computer') {
        onboardingConvo(bot, { type: 'message', user: message.user })
      // if it was a notebook, start the task help conversation
      } else if (message.reaction === 'notebook') {
        helpTaskConvo(bot, { type: 'message', user: message.user })
      }
    }
  })
}

exports.init = init;
