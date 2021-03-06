'use strict'
const messages = require('./slackwarriorMessages');
const api = require('./slackwarriorAPI');

const init = function (controller) {
  // * * * conversations * * * //

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
                const answer = { channel: message.channel, as_user: true }
                answer.attachments = [
                  {
                    pretext: text,
                    mrkdwn_in: ['pretext'],
                    callback_id: 'newtoken',
                    actions: [
                      {
                        name: 'taskhelp',
                        text: ':notebook: Task help',
                        value: 'taskhelp',
                        type: 'button',
                      },
                    ],
                  },
                ]
                bot.api.chat.postMessage(answer, (postErr) => {
                  if (postErr) {
                    bot.botkit.log('error posting message in newTokenConvo')
                  }
                })
              } else {
                bot.reply(message, messages.randomErrorMessage())
                bot.botkit.log('error saving user token', saveErr)
              }
            });
          // the convo did not end with status "completed"
          } else {
            const answer = {
              channel: message.user,
              as_user: true,
              attachments: [
                {
                  pretext: 'Alright. If you want to try again please ask me about `onboarding` whenever you\'re ready.',
                  mrkdwn_in: ['pretext'],
                  callback_id: 'error',
                  actions: [
                    {
                      name: 'onboarding',
                      text: ':computer: Onboarding',
                      value: 'onboarding',
                      type: 'button',
                    },
                  ],
                },
              ],
            }
            bot.api.chat.postMessage(answer, (postErr) => {
              if (postErr) {
                bot.botkit.log('error posting reply', postErr)
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
      // if the user already has an inthe.am token saved in local storage
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
                const answer = { channel: message.user, text: 'Alright, as you wish. If you want to change your `token` later just tell me and please feel free to ask me for `help` at any time :robot_face:', as_user: true }
                bot.api.chat.postMessage(answer, (postErr) => {
                  if (postErr) {
                    bot.botkit.log('error posting reply', postErr)
                  }
                })
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

  // specific help for the task commands
  function helpTaskConvo(bot, message, fromButton) {
    bot.startPrivateConversation(message, (err, dm) => {
      dm.say('All commands to work with tasks start with `task`. Right now I know the following commands:')
      dm.say('`task help`, `task`, `task list`, `task add`, `task 23`, `task 23 done`, `task 23 start`, `task 23 stop`, `task 23 modify`, `task 23 annotate`\nYou\'ll have to replace `23` with the `short_id` of the task you want to adress.')
      dm.say('You can find more information about my available commands and tasks in general at https://slackwarrior.org/doc.html')
      dm.next()
    })
  }

  // general help, offer ways to get more specific help
  function helpConvo(bot, message) {
    // bot.botkit.log('helpConvo', message)
    bot.startPrivateConversation(message, (err, dm) => {
      dm.say('You\'re looking for help on how to use my services? I\'m glad you asked!\nI\'m Slackwarrior and I\'m here to help you manage your tasks.');
      dm.say('Luckily for me some very smart people built taskwarrior.org, a really awesome task manager, so I don\'t have to do all the hard work.\nAnd also luckily for me some other very smart people built inthe.am, which helps you sync your tasks among different devices and access them from every brower. Convenient, right?');

      // at the end of the conversation
      dm.on('end', () => {
        const answer = {}
        const attachment = {
          pretext: 'Please tell me if you want me to help you with the `onboarding` or if you\'d like to see some more detailed `task help`.',
          mrkdwn_in: ['pretext'],
        }
        const actions = [
          {
            name: 'onboarding',
            text: ':computer: Onboarding',
            value: 'onboarding',
            type: 'button',
          },
          {
            name: 'taskhelp',
            text: ':notebook: Task help',
            value: 'taskhelp',
            type: 'button',
          },
        ]
        attachment.actions = actions
        attachment.callback_id = 'help'

        answer.attachments = [attachment]
        bot.reply({ channel: message.user }, answer)
      })
    })
  }

  // offer help with the onboarding process and start the tokenConvo, if the user wants that
  function onboardingConvo(bot, message) {
    bot.startPrivateConversation(message, (err, convo) => {
      if (!err) {
        convo.say('If you want me to help you managing your tasks, you\'ll first need an account at inthe.am\nYou can sign up with a google account and it\'s completely free! :free:')
        convo.say('Once you have an account there I need your "token", you can find it on inthe.am/configure under "API Access"\nslackwarrior.org/apikey.png')
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
            bot.botkit.log('im if')
            const answer = { channel: message.user, text: 'Alright, as you wish. Please tell me once you have your token, so we can begin working on your tasks.', as_user: true }
            bot.api.chat.postMessage(answer, (postErr) => {
              if (postErr) {
                bot.botkit.log('error posting reply', postErr)
              }
            })
          }
        })
      } else {
        bot.reply(message, messages.randomErrorMessage())
        bot.botkit.log('error starting onboarding convo', err)
      }
    })
  }

  // handle all task commands (but help)
  function handleTaskCommand(bot, message) {
    let text = message.text;
    const lcText = message.text.toLowerCase();
    // task add
    if (lcText.indexOf('task add ') > -1) {
      text = text.substring(9, text.length)
      if (text && text.length > 0) {
        api.addTask(bot, message, text)
      } else {
        bot.reply(message, messages.randomTaskErrorMessage())
      }
    // if the second token is a digit
    } else if (lcText.indexOf('task ') > -1 && /^-?\d+\.?\d*$/.test(lcText.split('task ')[1].split(' ')[0])) {
      text = text.substring(5, text.length)
      api.changeTask(bot, message, text)
    // task all
    } else if (lcText.indexOf('task all') > -1) {
      api.sendAllTasks(bot, message);
    // task list
    } else if (lcText.indexOf('task list') > -1) {
      api.sendTaskList(bot, message);
    // task
    } else if (lcText === 'task') {
      api.sendTasks(bot, message);
    } else {
      bot.reply(message, messages.randomTaskErrorMessage())
    }
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

  // handle all commands that start with "task" (except for "task help") and call their handler functions
  controller.hears(['^task'], 'direct_message,direct_mention,mention', (bot, message) => {
    handleTaskCommand(bot, message)
  });

  // handle request to the bot to introduce itself and provide ways to get help
  controller.hears(['introduce'], 'direct_message,direct_mention,mention', (bot, message) => {
    // make it look like the bot is typing and wait a couple of seconds to increase the illusion of a user
    bot.startTyping(message);
    setTimeout(() => {
      bot.reply(message, '')
      bot.startTyping(message);

      const answer = {}
      answer.attachments = [
        {
          pretext: 'Well, hello everyone, I\'m Slackwarrior and I\'m here to help you manage your tasks. :notebook:\nPlease feel free to ask me for `help` at any time!',
          mrkdwn_in: ['pretext'],
          callback_id: 'help',
          actions: [
            {
              name: 'help',
              text: ':question: Help',
              value: 'help',
              type: 'button',
            },
          ],
        },
      ]
      bot.reply(message, answer)
    }, 2000)
  })

  // handle a user's request for onboarding
  controller.hears(['onboarding'], 'direct_message,direct_mention,mention', (bot, message) => {
    onboardingConvo(bot, message)
  })

   // reply if a user thanks the bot
  controller.hears(['thanks', 'thank you', 'thankful', 'grateful', 'gratitude'], 'direct_message,direct_mention,mention', (bot, message) => {
    bot.reply(message, messages.randomThanksMessage())
  })

   // reply if a user greets the bot
  controller.hears(['hi', 'hello', 'hey', 'good morning', 'good evening', 'greetings'], 'direct_message,direct_mention,mention', (bot, message) => {
    bot.reply(message, messages.randomGreetMessage())
  })


  // slackwarrior is always hard at work
  controller.hears(['hard at work'], 'direct_message,direct_mention,mention', (bot, message) => {
    bot.reply(message, 'http://tinyurl.com/craftybot-gif')
  })

  // receive an interactive message, and reply with a message that will replace the original
  controller.on('interactive_message_callback', (bot, message) => {
    const short_id = message.callback_id
    const command = message.actions[0].name
    // check message.actions and message.callback_id to see what action to take...
    if (command === 'done') {
      api.completeTask(bot, message, short_id, true)
    } else if (command === 'start') {
      api.startStopTask(bot, message, short_id, 'start', true)
    } else if (command === 'stop') {
      api.startStopTask(bot, message, short_id, 'stop', true)
    } else if (command === 'details') {
      api.taskDetails(bot, message, short_id, true)
    } else if (command === 'task') {
      api.sendTasks(bot, message, true)
    } else if (command === 'list') {
      api.sendTaskList(bot, message, true)
    } else if (command === 'onboarding') {
      onboardingConvo(bot, { type: 'message', user: message.user }, true)
    } else if (command === 'taskhelp') {
      helpTaskConvo(bot, { type: 'message', user: message.user }, true)
    } else if (command === 'help') {
      helpConvo(bot, { type: 'message', user: message.user })
    }
  })
}

exports.init = init;
