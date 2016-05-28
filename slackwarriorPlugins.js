var request = require('request');
var datejs = require('date.js');
var moment = require('moment');
var Promise = require('bluebird');
Promise.promisifyAll(require("request"));

// general error messages
var GENERAL_ERROR_MESSAGES = ['I\'m sorry, but there was an internal problem, it\'s probably the old hydraulic pump again. Please try again later, it should be less squeaky once it\'s cooled down a little...']
var TASK_ERROR_MESSAGES = ['I\'m sorry, but I didn\'t understand that command. Please feel free to ask for `task help` at any time, if you want me to show you the available commands again.']
var NOT_MOST_URGENT_MESSAGES = ['You have more urgent tasks though... :zipper_mouth_face:','Looks like you should have been working on something else though... :alarm_clock:']

var REGEX_ALL_WHITESPACE_THAT_IS_NOT_QUOTED = /\s+(?=([^"]*"[^"]*")*[^"]*$)/g
var REGEX_FIRST_COLON_THAT_IS_NOT_QUOTED = /:+(?=([^"]*"[^"]*")*[^"]*$)/

function randomMessage(messages) {
  var randomMessages = shuffle(messages)
  return randomMessages[0]
}

// define a method "trim" on the String prototype
if(typeof(String.prototype.trim) === "undefined")
{
    String.prototype.trim = function() 
    {
        return String(this).replace(/^\s+|\s+$/g, '');
    };
}

// define a methog "padRight" on the String prototype
String.prototype.padRight = function(l, c) {return this+Array(l-this.length+1).join(c||" ")}

// define a methog "padLeft" on the String prototype
String.prototype.padLeft = function(l, c) {
    var str = this;
    while (str.length < l)
        str = c + str;
    return str;
}

// shuffle an array and return it
function shuffle(array) {
    var currentIndex = array.length, temporaryValue, randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {

      // Pick a remaining element...
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex -= 1;

      // And swap it with the current element.
      temporaryValue = array[currentIndex];
      array[currentIndex] = array[randomIndex];
      array[randomIndex] = temporaryValue;
    }

    return array;
  }

var init = function (controller) {

  // * * * event listeners * * * //

  // handle request for help with the task system
  controller.hears(['^help task', '^task help'], 'direct_message,direct_mention,mention', function(bot, message) {
    helpTaskConvo(bot, message)
  })

  // handle request for general help
  controller.hears(['^help'], 'direct_message,direct_mention,mention', function(bot, message) {
    helpConvo(bot, message)
  })

  // handle all commands that start with "task" (except for "task help") and call their handler functions
  controller.hears(['^task'], 'direct_message,direct_mention,mention', function(bot, message) {
    var text = message.text;
    var lcText = message.text.toLowerCase();
    // task add
    if (lcText.indexOf('task add ') > -1) {
      text = text.split('task add ')[1]
      if (text && text.length > 0) {
        addTask(bot, message, text)
      } else {
        bot.reply(message, randomMessage(TASK_ERROR_MESSAGES))
      }      
    // if the second token is a digit
    } else if (lcText.indexOf('task ') > -1 && /^-?\d+\.?\d*$/.test(lcText.split('task ')[1].split(' ')[0])) {
      text = text.substring(5, text.length)
      changeTask(bot, message, text)
    // task list
    } else if (lcText.indexOf('task list') > -1) {
      sendAllTasks(bot, message);
    // task
    } else if (lcText == 'task') {
      sendTasks(bot, message);  
    } else {
      bot.reply(message, randomMessage(TASK_ERROR_MESSAGES))
    }
  });

  // handle request to the bot to introduce itself and provide ways to get help
  controller.hears(['introduce'], 'direct_message,direct_mention,mention', function(bot, message) {
    // make it look like the bot is typing and wait a couple of seconds to increase the illusion of a user
    bot.startTyping(message);
    setTimeout(function () {
      bot.reply(message, 'Well, hello everyone, I\'m Slackwarrior and I\'m here to help you manage your tasks. :notebook:')
      bot.startTyping(message);
      setTimeout(function () {
        var answer = {channel: message.channel, text: 'Please feel free to ask me for `help` at any time or just tap the :grey_question: now.', as_user: true}
        // add a question mark reaction to the message as a way for the users to get help
        bot.api.chat.postMessage(answer, function (err, response) {
          if (!err) {
            addReaction(bot, response, 'grey_question')
          } else {
            bot.botkit.log('error sending message', response, err);     
          }
        })
      }, 3000)
    }, 3000)
  })

  // slackwarrior is always hard at work
  controller.hears(['hard at work'], 'direct_message,direct_mention,mention', function(bot, message) {
    bot.reply(message, 'http://tinyurl.com/craftybot-gif')
  })

  // handle a user's request for onboarding
  controller.hears(['onboarding'], 'direct_message,direct_mention,mention', function(bot, message) {
    onboardingConvo(bot, message)
  })

  // handle reactions added to the bot's messages 
  controller.on('reaction_added', function (bot, message) {
    if (message.item_user == bot.identity.id && message.user != bot.identity.id) {
      bot.botkit.log('user reaction_added to a bot message', message.reaction)
      // if it was a grey question mark, start the general help conversation
      if (message.reaction == 'grey_question') {
        helpConvo(bot, { type: 'message', user: message.user})
      // if it was a computer, start the onboarding help
      } else if (message.reaction == 'computer') {
        onboardingConvo(bot, { type: 'message', user: message.user})
      // if it was a notebook, start the task help conversation
      } else if (message.reaction == 'notebook') {
        helpTaskConvo(bot, { type: 'message', user: message.user})
      }
    }
  })

  // * * * task functions * * * //

  // function to compare tasks by urgency
  function compareTasks(a,b) {
    if (a.urgency > b.urgency)
      return -1;
    else if (a.urgency < b.urgency)
      return 1;
    else 
      return 0;
  }

  // basic settings for an inthe.am API call
  function prepareAPI(api, method, token) {
    return {
      "async": true,
      json: true,
      "crossDomain": true,
      "url": "https://inthe.am/api/v2/" + api + "/",
      "method": method,
      "headers": {
        "authorization": "Token " + token,
        "cache-control": "no-cache",
        "Content-Type": "application/json",
        "Referer": "https://inthe.am/",
      },
      data: "",
      "processData": false
    }
  }

  // adds the given reaction to the given message
  function addReaction(bot, message, reaction) {
    bot.api.reactions.add({
      timestamp: message.ts,
      channel: message.channel,
      name: reaction,
      }, function(err, res) {
      if (err) {
        bot.botkit.log('failed to add ' + reaction + ' reaction', err);
      }
    });
  }

  // removes the given reaction from the given message
  function removeReaction(bot, message, reaction) {
    bot.api.reactions.remove({
      timestamp: message.ts,
      channel: message.channel,
      name: reaction,
      }, function(err, res) {
      if (err) {
        bot.botkit.log('failed to remove ' + reaction + ' reaction', err);
      }
    });
  }  

  // converts a single task into a Slack message attachment
  function task2attachement(task) {
    // basic settings for one attachement in the result message
    var attachment = {
      "fallback": "this did not work for some reason",
      "fields": [
        {
            "title": "id",
            "short": true
        },
        {
            "title": "project / tag(s)",
            "short": true
        }
      ]
    }

    // create a link to inthe.am in ID field
    attachment.fields[0]['value'] = '<https://inthe.am/tasks/' + task.id + '|' + task.short_id + '>';

    // set project and tags (if any)
    var taskProject = task.project;
    if (task.tags) {
      taskProject = taskProject + ' / '
      for (var j = 0; j < task.tags.length; j++) {
        tag = task.tags[j];
        taskProject = taskProject + tag
        if (j < task.tags.length - 1) {
          taskProject = taskProject + ', '
        }
      }
    }
    attachment.fields[1]['value'] = taskProject;

    var title = task.description;
    if (task.start) {
      title = title + ' (active)'
    }
    attachment.title = title;

    // set the color according to the priority of the task
    if (task.priority == 'H') {
      attachment.color = 'danger'
    }
    if (task.priority == 'M') {
      attachment.color = 'warning'
    }

    // format entry- and modified-date
    var entry = moment(task.entry);
    var entryDiff = entry.fromNow()
    

    var modified = moment(task.modified);
    var modifiedDiff = modified.fromNow()
    
    var text = 'Created: ' + entry.format('ll') + ' (' + entryDiff + ') / Modified: ' + modified.format('ll') + ' (' + modifiedDiff + ')';

    attachment.text = text;

    return attachment;
  }

  // get a the user's token from the local storage
  function getIntheamToken(bot, message, userID, cb) {
    controller.storage.users.get(userID, function(err, user) {
      if (!err && user && user.token && user.token.length > 0) {
      
          var token = user.token;
          bot.botkit.log('found user token in local storage', token)
          cb(token)
        
      } else {
        bot.reply(message, 'Looks like we haven\'t been introduced yet. I\'m Slackwarrior and I\'m here to help you manage your tasks. Please feel free to ask me for `help` any time. :robot_face:')
        bot.botkit.log('error getting user or user token from storage', err)
      }
    })
  }

  // wrapper function for API requests to inthe.am
  function apiRequest(bot, message, settings, cb) {
    request(settings, function (err, response, body) {
      var rc = response.statusCode;
      
      // if this was not a success
      if (rc !== 200 && rc !== 201) {
        bot.botkit.log('API request error - err', err)
        bot.botkit.log('API request error - res', response)
        bot.botkit.log('API request error - body', body)
        // remove the thinking_face reaction again
        removeReaction(bot, message, 'thinking_face')
      }
      // general error occured
      if (err || !rc) {
        bot.reply(message, randomMessage(GENERAL_ERROR_MESSAGES))
      // malformed request, see error details
      } else if (rc === 400) {
        bot.reply(message, 'I\'m sorry, but it looks like inthe.am had some trouble with that :confused:') 
        bot.reply(message, 'Maybe their message(s) can help you narrowing it down?')
        for (var prop in body) {
          if (body.hasOwnProperty(prop)) {
            bot.reply(message, '`' + prop + '` : ' + body[prop].join(' '))
          }
        }
      // entity does not exist    
      } else if (rc === 404) {  
        bot.reply(message, 'I\'m sorry, but it looks like that task doesn\'t even exist? :confused:') 
      // repo locked
      } else if (rc === 409) {  
        bot.reply(message, 'I\'m sorry, but it looks like your repository is locked. You should check on inthe.am for more information...')
      // inthe.am server error      
      } else if (rc === 500) {   
        bot.reply(message, 'I\'m sorry, but it looks like inthe.am is having some troubles right now. The error has been logged and the admins have been notified. Please try again in a little while.')     
      // auth
      } else if (rc === 401 || rc === 403) {
        
        var answer = {channel: message.channel, text: 'Oops, that didn\'t work. Looks like I remember your token wrong. If you want to tell me your token please ask me about `onboarding` or just tap on the :computer: now.', as_user: true}  
        bot.api.chat.postMessage(answer, function (err, response) {
          if (!err) {
            addReaction(bot, response, 'computer')
          }
        })        
      // success
      } else if (rc === 200 || rc === 201) {
        cb(err, response, body)
      }
    })
  }

  // call the inthe.am API to get a list of all tasks
  function getTasks(bot, message, user, cb) {
    getIntheamToken(bot, message, user, function (token) {
      var settings = prepareAPI('tasks', 'GET', token);
      // call the API pass the callback function on
      apiRequest(bot, message, settings, cb);
    })
  }

  // create and upload a snippet with all pending tasks
  function sendAllTasks(bot, message) {
    bot.botkit.log('getting all tasks for user', message.user);
    // add a reaction so the user knows we're working on it
    addReaction(bot, message, 'thinking_face')

    // get a list of all tasks
    getTasks(bot, message, message.user, function (err, response, body) {
      // remove the thinking face again
      removeReaction(bot, message, 'thinking_face')
      
      // sort list of tasks by urgency
      var tasks = response.body;

      if (tasks && tasks.length && tasks.length > 0) {
        tasks.sort(compareTasks);
        var l = tasks.length;
        bot.botkit.log('got ' + l + ' tasks for user', message.user);

        // add some headers to the snippet
        var result = [' ID  Prio  Project     Description',''];
        // add one line in the snippet for every pending task
        for (var i = 0; i < l; i++) {
          var task = tasks[i];
          // format short_id to a length of three
          var short_id = '' + task.short_id;
          short_id = short_id.padLeft(3, ' ')

          var priority = ' ';
          if (task.priority) {
            priority = task.priority;
          }
          priority = priority.padRight(4, ' ')

          var project = ' ';
          if (task.project) {
            project = '' + task.project
          }
          project = project.padRight(11, ' ')
          // concat the values with some spaces 
          var line = short_id + '  ' + priority + '  ' + project + ' ' + task.description
          if (task.start) {
            line = line + ' (active)'
          }
         
          result.push(line)
        }

        result = result.join('\n')

        var d = new Date();
        var date = d.toLocaleString();

        // upload the resulting snippet
        bot.api.files.upload({
          content: result,
          channels: message.channel,
          title: 'Tasks on ' + date
          }, function (err, res) {
          // bot.botkit.log('res', res);
            if (err) {
              bot.botkit.log('err uploading tasks snippet', err);
              bot.reply(message, 'There was some problem uploading the tasks file')
              bot.reply(message, randomMessage(GENERAL_ERROR_MESSAGES))
            } else {
              bot.reply(message, 'These are your ' + l + ' pending tasks, sorted by urgency :notebook:')
            }
        })
      } else {
        bot.reply(message, 'Looks like you have no pending tasks right now! You should go relax for a while :beach_with_umbrella:')
      }
    
    })
  }

  // create a message (with attachments) and list the the user's three most urgent tasks
  function sendTasks(bot, message) {
    bot.botkit.log('getting tasks for user', message.user);
    // add a reaction so the user knows we're working on it
    addReaction(bot, message, 'thinking_face')

    getTasks(bot, message, message.user, function (err, response, body) {
      // remove the thinking face again
      removeReaction(bot, message, 'thinking_face')
      
      // sort list of tasks by urgency
      var tasks = response.body;
      if (tasks && tasks.length && tasks.length > 0) {
        tasks.sort(compareTasks);
        var l = tasks.length;
        bot.botkit.log('got ' + l + ' tasks for user ', message.user);
        
        //
        var pretext = ':notebook: You have ' + tasks.length + ' pending tasks right now';
        if (l >= 2) {
          pretext = pretext + ', here are the top 3: '
        } else {
          pretext = pretext + ':'
        }
        
        // basic settings for the result message
        var answer = {
            channel: message.channel,
            as_user: true,
        }
        
        // limit tasks to 3
        var maxTasks = l;
        if (l >= 2) {
          maxTasks = 2;
        }

        if (l < 3) {
          maxTasks = l -1;
        }
     
        // create a list of attachments, one per task
        var attachments = [];
        for (var i = 0; i <= maxTasks; i++) {
          var task = tasks[i];

          // create a message attachment from this task
          var attachment = task2attachement(task);

          // if this is the very first attachment we set the pretext
          if (i === 0) {
            attachment['pretext'] = pretext;
          }

          attachments.push(attachment);
        }

        // add attachments to the message and send it
        answer['attachments'] = attachments;
        bot.api.chat.postMessage(answer, function (err, response) {
          if (!err) {
            bot.botkit.log('tasks sent');
          } else {
            bot.botkit.log('error sending tasks', response, err);     
          }
          
        })
      } else {
        bot.reply(message, 'Looks like you have no pending tasks right now! You should go relax for a while :beach_with_umbrella:')
      }
    })
  }

  function cl2task(bot, message, commandLine, oldTask) {
    // initialize a task object with default priority = 'L'
    var result = {
      description: '',
      priority: 'L',
      tags: [],
    };
    // if we're updating a task remember the old values
    if (oldTask) {
      result = oldTask;
    }

    commandLine = commandLine.replace(REGEX_ALL_WHITESPACE_THAT_IS_NOT_QUOTED,'__|__')
    
    var tokens = commandLine.split('__|__')
    var descriptionParts = []

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      // if it was a modifier
      bot.botkit.log('token', token)
      token = token.replace(REGEX_FIRST_COLON_THAT_IS_NOT_QUOTED,'__|__')
      bot.botkit.log('token', token)
      if (token.indexOf('__|__') > -1) {
        var orgKey = token.split('__|__')[0];
        var key = token.split('__|__')[0];
        var value = token.split('__|__')[1];
        key = resolveModifierShorthand(key);

        if (value.indexOf('"') > -1) {
          value = value.replace('"', '')
        }
        
        // special handling for "priority" which has some shorthand versions
        if (key === 'priority') {
          value = resolvePriority(value)
          result[key] = value;
        } else if (key === 'status') {
          value = resolveStatus(value)
          result[key] = value;

        } else if (key === 'description') {
          descriptionParts.push(value)
        // in case of date values we can't just split on the ":"
        } else if (key === 'due' || key === 'wait' || key === 'start' || key === 'scheduled') {
          bot.botkit.log('XXXXXXXXXX', key)
          bot.botkit.log('XXXXXXXXXX', value)
          value = datejs(value)
          bot.botkit.log('XXXXXXXXXX', value)
          result[key] = value;
        } else {
          result[key] = value;
        }
        
      // if we're adding a tag
      } else if (token.startsWith('+')) {
        var tag = token.split('+')[1]
        // if the tag is not already in the list of tags
        if (result.tags.indexOf(tag) == -1) {
          result.tags.push(tag)
        }
      // if we're removing a tag
      } else if (token.startsWith('-')) {
        var tag = token.split('-')[1]
        var index = result.tags.indexOf(tag)
        if (index > -1) {
          result.tags.splice(index, 1);
        }
      // if it was none of the above we're creating a new task and this part of the description
      } else {
        descriptionParts.push(token)
      }
    }

    if (descriptionParts.length > 0) {
      result.description = descriptionParts.join(' ').trim()
    }

    return result;
  }

  function resolveModifierShorthand(modifier) {
    var modifiers = {
      priority: 'priority',
      priorit: 'priority',
      priori: 'priority',
      prior: 'priority',
      prio: 'priority',
      pri: 'priority',
      project: 'project',
      projec: 'project',
      proje: 'project',
      proj: 'project',
      pro: 'project',
      description: 'description',
      descriptio: 'description',
      descripti: 'description',
      descript: 'description',
      descrip: 'description',
      descri: 'description',
      descr: 'description',
      desc: 'description',
      des: 'description',
      de: 'description',
      status: 'status',
      statu: 'status',
      stat: 'status',
      due: 'due',
      du: 'due',
      start: 'start',
      star: 'start',
      wait: 'wait',
      wai: 'wait',
      wa: 'wait',
      w: 'wait',
      scheduled: 'scheduled',
      schedule: 'scheduled',
      schedul: 'scheduled',
      schedu: 'scheduled',
      sched: 'scheduled',
      sche: 'scheduled',
      sch: 'scheduled',
      sc: 'scheduled',
    }

    modifier = modifier.toLowerCase()

    return modifiers[modifier];
  }

  function resolvePriority(prio) {
    prio = prio.toLowerCase()
    if (prio === 'h' || prio === 'hi' || prio === 'hig' || prio === 'high') {
      return 'H'
    } else if (prio === 'm' || prio === 'me' || prio === 'med' || prio === 'medi' || prio === 'mediu' || prio === 'medium') {
      return 'M'
    } else {
      return 'L'
    }
  }

  function resolveStatus(prio) {
    var result = 'pending';
    var prios = {
      pending: 'pending',
      pendin: 'pending',
      pendi: 'pending',
      pend: 'pending',
      pen: 'pending',
      pe: 'pending',
      p: 'pending',
      completed: 'completed',
      complete: 'completed',
      complet: 'completed',
      comple: 'completed',
      compl: 'completed',
      comp: 'completed',
      com: 'completed',
      co: 'completed',
      c: 'completed',
      waiting: 'waiting',
      waitin: 'waiting',
      waiti: 'waiting',
      wait: 'waiting',
      wai: 'waiting',
      wa: 'waiting',
      w: 'waiting',
      deleted: 'deleted',
      delete: 'deleted',
      delet: 'deleted',
      dele: 'deleted',
      del: 'deleted',
      de: 'deleted',
      d: 'deleted',
    }

    prio = prio.toLowerCase()
    if (prios[prio]) {
      result = prios[prio]
    }
    
    return prio
  }


  // status  One of ‘pending’, ‘completed’, ‘waiting’, or ‘deleted’. New tasks default to ‘pending’.


  // parse the user's command and add a task using the inthe.am API
  function addTask(bot, message, text) {
    // add a reaction so the user knows we're working on it
    addReaction(bot, message, 'thinking_face')

    // create a task object from the user input
    var task = cl2task(bot, message, text)

    // get the token for the user 
    getIntheamToken(bot, message, message.user, function (token) {
      var settings = prepareAPI('tasks', 'POST', token);

      settings.body = task;

      // call the inthe.am API to add the new task
      apiRequest(bot, message, settings, function (err, response, body) {
        // remove the reaction again
        removeReaction(bot, message, 'thinking_face')
       
        bot.botkit.log('added task for ' + message.user);
        var priority;
        if (task.priority == 'L') {
          priority = 'low" :blue_book:';
        } else if (task.priority == 'M') {
          priority = 'medium" :notebook_with_decorative_cover:'
        } else {
          priority = 'high" :closed_book:'
        }
        var answerText = 'Alright, I\'ve added task '+ body.short_id + ' to the list with priority "' + priority
        bot.reply(message, {text: answerText})
     
      })      
    });
  }

  // parse the user's command and add a task using the inthe.am API
  function modifyTask(bot, message, short_id, text) {
    // add a reaction so the user knows we're working on it
    addReaction(bot, message, 'thinking_face')
    
    var tokens = text.split(' ')
    tokens.splice(0,2)
    text = tokens.join(' ')
    

    // get a list of all pending tasks
    getTasks(bot, message, message.user, function (err, response, body) {

      var tasks = response.body;
      // loop over all tasks...
      for (var i = 0; i < tasks.length; i++) {
        var task = tasks[i];

        // if this is the task to start/stop
        if (task.short_id == short_id) {

          // create a task object from old task and the user input 
          var newTask = cl2task(bot, message, text, task)

          // get the token for the user 
          getIntheamToken(bot, message, message.user, function (token) {
            var settings = prepareAPI('tasks/' + task.id, 'PUT', token);

            settings.body = newTask;

            // call the inthe.am API to add the new task
            apiRequest(bot, message, settings, function (err, response, body) {
              // remove the reaction again
              removeReaction(bot, message, 'thinking_face')

              bot.botkit.log('changed task for ' + message.user);
             
              var answerText = 'Alright, I\'ve changed task '+ body.short_id + ' for you.'
              bot.reply(message, {text: answerText})
            })      
          });
        }
      }
      
    })
  }

  // mark as task as completed using the inthe.am API
  function completeTask(bot, message, short_id) {
    // add a reaction so the user knows we're working on it
    addReaction(bot, message, 'thinking_face')

    // get a list of all pending tasks
    getTasks(bot, message, message.user, function (err, response, body) {
      
      var tasks = response.body;
      // sort them by urgency
      tasks.sort(compareTasks);
      // the highest urgency of all pending tasks in the list
      var highestUrgency = 0;
      // the urgency of the completed task
      var completedUrgency = -1; 
      // loop over all tasks...
      for (var i = 0; i < tasks.length; i++) {
        var task = tasks[i];
        // remember the max urgency
        if (task.urgency > highestUrgency) {
          highestUrgency = task.urgency;
        }
        // if this is the completed task
        if (task.short_id == short_id) {
          // remember the urgency of the completed task
          completedUrgency = task.urgency;

          getIntheamToken(bot, message, message.user, function (token) {
            var settings = prepareAPI('tasks/' + task.id, 'DELETE', token);
       
            // call the inthe.am API and mark the task as complete
            apiRequest(bot, message, settings, function (err, response, body) {
              // remove the thinking_face reaction again
              removeReaction(bot, message, 'thinking_face')
        
              bot.botkit.log('marked task ' + short_id + ' for user ' + message.user + ' as complete');
              var answerText = 'Ok, task ' + short_id + ' has been marked as complete - well done!'
              if (tasks.length -1 == 0) {
                asnwerText = answerText + ' That was the last pending task on your list! You should go relax for a while :beach_with_umbrella:'
              } else {
                asnwerText = answerText + ' One done, ' + (tasks.length -1) + ' to go :clap:'
              }
              bot.reply(message, answerText)
              // if the completed task was not the one with the highest urgency
              if (completedUrgency < highestUrgency) {
                bot.reply(message, randomMessage(NOT_MOST_URGENT_MESSAGES))
              }
            })
          });
        }
      }
    })
  }

  // handler for all commands that specify an ID, e.g. "task 23 done"
  function changeTask(bot, message, text) {
    var tokens = text.split(' ');
    var short_id = tokens[0]
    var command = tokens[1]
    if (!command) {
      taskDetails(bot, message, short_id);
    } else if (command === 'done') {
      completeTask(bot, message, short_id)
    } else if (command === 'start') {
      startStopTask(bot, message, short_id, 'start')
    } else if (command === 'stop') {
      startStopTask(bot, message, short_id, 'stop')
    } else if (command === 'modify') {
      modifyTask(bot, message, short_id, text)
    } else {
      bot.reply(message, 'I\'m sorry, but I don\'t know how to execute the command `' + command + '`, right now I only know `done`.')
    }
  }

  // start or stop a task using the inthe.am API (depending on param "mode")
  function startStopTask(bot, message, short_id, mode) {
    // add a reaction so the user knows we're working on it
    addReaction(bot, message, 'thinking_face')

    // get a list of all pending tasks
    getTasks(bot, message, message.user, function (err, response, body) {
      
      var tasks = response.body;
      // loop over all tasks...
      for (var i = 0; i < tasks.length; i++) {
        var task = tasks[i];

        // if this is the task to start/stop
        if (task.short_id == short_id) {

          getIntheamToken(bot, message, message.user, function (token) {
            var settings = prepareAPI('tasks/' + task.id + '/' + mode + '/', 'POST', token);
       
            // call the inthe.am API and mark the task as started or stopped
            apiRequest(bot, message, settings, function (err, response, body) {
              // remove the thinking_face reaction again
              removeReaction(bot, message, 'thinking_face')
             
              bot.botkit.log(mode + 'ed task ' + short_id + ' for user ' + message.user);
              var answerText = 'Ok, I have '
              if (mode === 'start') {
                answerText = answerText + 'started '
              } else {
                answerText = answerText + 'stopped '
              }
              answerText = answerText + 'the timer for task ' + short_id + ' for you. :stopwatch:';

              bot.reply(message, answerText)
            })
          });
        }
      }
  
    })
  }

  // get the details for the specified task
  function taskDetails(bot, message, short_id) {
    // add a reaction so the user knows we're working on it
    addReaction(bot, message, 'thinking_face')

    // get a list of all pending tasks
    getTasks(bot, message, message.user, function (err, response, body) {
      var found = false;
      // remove the thinking_face reaction again
      removeReaction(bot, message, 'thinking_face')

      var tasks = response.body;
      // loop over all tasks...
      for (var i = 0; i < tasks.length; i++) {
        var task = tasks[i];
        // if this is the task we're looking for
        if (task.short_id == short_id) {
          found = true;
          bot.botkit.log('in details', short_id)
          // basic settings for the result message
          var answer = {
            channel: message.channel,
            as_user: true,
          }
          var attachment = {
            "fallback": "this did not work for some reason",
             "mrkdwn_in": ["text", "pretext"]
          }

          // set the color according to the priority of the task
          if (task.priority == 'H') {
            attachment.color = 'danger'
          }
          if (task.priority == 'M') {
            attachment.color = 'warning'
          }

          // format entry-, start- and modified-date and the deltas
          var entry = moment(task.entry);
          var entryDiff = entry.fromNow();
          entry = entry.format('llll')
          var modified = moment(task.modified);
          var modifiedDiff = modified.fromNow()
          modified = modified.format('llll')
          var start;
          var startDiff = '';
          if (task.start) {
            start = moment(task.start);
            startDiff = start.fromNow()
            start = start.format('llll')
          }
          var due;
          var dueDiff = '';
          if (task.due) {
            due = moment(task.due);
            dueDiff = due.fromNow()
            due = due.format('llll')
          }
          var wait;
          var waitDiff = '';
          if (task.wait) {
            wait = moment(task.wait);
            waitDiff = wait.fromNow()
            wait = wait.format('llll')
          }
          var scheduled;
          var scheduledDiff = '';
          if (task.scheduled) {
            scheduled = moment(task.scheduled);
            scheduledDiff = scheduled.fromNow()
            scheduled = scheduled.format('llll')
          }
          
          attachment.title = 'Details for task <https://inthe.am/tasks/' + task.id + '|' + task.short_id + '>'
          var text = '```';
          text = text + 'ID'.padRight(19, ' ') + short_id + '\n';
          var description = 'Description'.padRight(19, ' ') + task.description
          if (task.start) {
            description = description + ' (active)'
          }
          
          text = text + description + '\n'
          text = text + 'Status'.padRight(19, ' ') + task.status + '\n'
          if (task.project) {
            text = text + 'Project'.padRight(19, ' ') + task.project + '\n'
          }
          text = text + 'Entered'.padRight(19, ' ') + entry + ' (' + entryDiff + ')\n'
          if (start) {
            text = text + 'Start'.padRight(19, ' ') + start + ' (' + startDiff + ')\n'
          }
          if (wait) {
            text = text + 'Wait'.padRight(19, ' ') + wait + ' (' + waitDiff + ')\n'
          }
          if (scheduled) {
            text = text + 'Scheduled'.padRight(19, ' ') + scheduled + ' (' + scheduledDiff + ')\n'
          }
          if (due) {
            text = text + 'Due'.padRight(19, ' ') + due + ' (' + dueDiff + ')\n'
          }
          text = text + 'Last modified'.padRight(19, ' ') + modified + ' (' + modifiedDiff + ')\n'
          if (task.tags) {
            var tags = '';
            text = text + 'Tags'.padRight(19, ' ')
            for (var j = 0; j < task.tags.length; j++) {
              var tag = task.tags[j];
              tags = tags + tag + ' '
            }
            text = text + tags + '\n'
          }
          text = text + 'UUID'.padRight(19, ' ') + task.uuid + '\n'
          text = text + 'Urgency'.padRight(19, ' ') + task.urgency + '\n'
          if (task.priority) {
            text = text + 'Priority'.padRight(19, ' ') + task.priority + '\n'
          }
          attachment.text = text + '```';

          answer.attachments = [attachment];

          bot.api.chat.postMessage(answer, function (err, response) {
            if (!err) {
              bot.botkit.log('task details sent');
            } else {
              bot.botkit.log('error sending task details', response, err);     
            }
          })
        }
      }
     
      if (!err && !found) {
        bot.botkit.log('no error, but problem getting task details for user ' + message.user)
        bot.reply(message, 'I\'m sorry, but there was a problem getting details for that task on your task list - maybe you have already completed it or it is not a `pending` task :confused:')
      }
    })
  }

  // * * * conversations * * * //

  // specific help for the task commands
  // TODO: create a snippet/post instead?
  function helpTaskConvo(bot, message) {
    bot.startPrivateConversation(message, function(err, dm) {
      dm.say('All commands to work with tasks start with `task`. Right now I know the following commands:')
      dm.say('With `task` you get an overview of your most urgent tasks')
      dm.say('When you ask me for your `task list` I will get you a complete list of all your pending tasks')
      dm.say('You can ask me to mark `task 23 done` once you\'ve completed task 23. You can find the ID (23 in this example) on your `task list` or on the `task` overview.')
      dm.say('And last but not least I can add tasks to your list, here are some examples:')
      dm.say('`task add remember the milk` to add the task "remember the milk" with default priority ("low") and without a project')
      dm.say('`task add fix that bug priority:H project:foo` to add the task "fix that bug" with priority "high" for the project "foo"')
      dm.say('`task add priority:M project:bar fix that other minor bug` to add the task "fix that other minor bug" with priority "medium" for the project "bar"')
      dm.say('For more information about tasks I\'d suggest the documentation on taskwarrior.org and inthe.am')
      dm.next()
    })
  }

  // general help offer ways to get more specific help
  function helpConvo(bot, message) {
    // bot.botkit.log('helpConvo', message)
    bot.startPrivateConversation(message, function(err, dm) {
      dm.say('You\'re looking for help on how to use my services? I\'m glad you asked!');
      dm.say('I\'m Slackwarrior and I\'m here to help you manage your tasks.');
      dm.say('Luckily for me some very smart people built taskwarrior.org, a really awesome task manager, so I don\'t have to do all the hard work.');
      dm.say('And also luckily for me some other very smart people built inthe.am, which helps you sync your tasks among different devices and access them from every brower. Convenient, right?');
      dm.say('I can talk with inthe.am and list your tasks, `add` new ones and mark them completed as you work through the list. ');

      // at the end of the conversation
      dm.on('end', function (convo) {
        var answer = {channel: message.user, text: 'Please tell me if you want me to help you with the `onboarding` or tap on the :computer:\nIf you\'d like to know more about working with tasks, please message me with `task help` or just tap the :notebook: now.', as_user: true}  
        bot.api.chat.postMessage(answer, function (err, response) {
          if (!err) {
            // add the computer reaction for the user to click on to get more help regarding the onboarding process
            addReaction(bot, response, 'computer')

            // add the computer notebook for the user to click on to get more help regarding tasks
            addReaction(bot, response, 'notebook')

          } else {
            bot.botkit.log('error sending message', response, err);     
          }
        })        
      })
    })
  }

  // offer help with the onboarding process and start the tokenConvo, if the user wants that
  function onboardingConvo(bot, message) {
    bot.startPrivateConversation(message, function(err, convo) {
      if (!err) {
        convo.say('If you want me to help you managing your tasks, you\'ll first need an account at inthe.am')
        convo.say('You can sign up with a google account and it\'s completely free! :free:')
        convo.say('Once you have an account there I need your "token", you can find it on inthe.am/configure under "API Access"')
        convo.say('slackwarrior.scheijan.net/apikey.png')
        convo.ask('Do you want me to add your token to my dossier now?', [
          {
            pattern: bot.botkit.utterances.yes,
            callback: function(response, convo) {
              // since no further messages are queued after this,
              // the conversation will end naturally with status == 'completed'
              convo.next();
              tokenConvo(bot, message);
            }
          },
          {
            pattern: bot.botkit.utterances.no,
            callback: function(response, convo) {
              convo.stop();
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
        convo.next();
        // at the end of the conversation
        convo.on('end', function(convo) {
          bot.botkit.log('status', convo.status)
          if (convo.status == 'stopped') {
            bot.reply(message, 'Alright, as you wish. Just tell me once you have your token, so we can begin working on your tasks.');
          }
        })

      } else {
        bot.reply(message, randomMessage(GENERAL_ERROR_MESSAGES))
        bot.botkit.log('error starting onboarding convo', err)
      }
    })    
  }

  // ask the user for their new token and add it to local storage
  function newTokenConvo(bot, message, user) {
    bot.startPrivateConversation(message, function(err, convo) {
      if (!err) {
        convo.ask('Ok, great, to get started please tell me your inthe.am token', function(response, convo) {
          convo.ask('Please double check that the token is correct - do you want me to note `' + response.text + '` in my dossier?', [
            {
              pattern: bot.botkit.utterances.yes,
              callback: function(response, convo) {
                // since no further messages are queued after this,
                // the conversation will end naturally with status == 'completed'
                convo.next();
              }
            },
            {
              pattern: bot.botkit.utterances.no,
              callback: function(response, convo) {
                // stop the conversation. this will cause it to end with status == 'stopped'
                convo.stop();
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
          convo.next();
        }, {'key': 'token'}); // store the results in a field called token

        convo.on('end', function(convo) {
          bot.botkit.log('in convo.end', convo.status)
          // if the status is completed (not "stopped") the conversation ended with a "yes"
          if (convo.status == 'completed') {
            bot.reply(message, 'OK! I will update my dossier...');
            user.token = convo.extractResponse('token');
            // save the token the local storage
            controller.storage.users.save(user, function(err, id) {
              if (!err) {
                bot.botkit.log('added new token for user ' + message.user, user.token)
                var text = 'Got it. Your token is in my dossier and we can get started now.\n';
                text = text + 'Why don\'t you try it out and add a task to your list? Maybe you need some milk? Try `task add remember the milk`\n'
                text = text + 'And please feel to ask for `task help` at any time if you want me to remind you on how I can assist you with your tasks. :robot_face:'
                var answer = {channel: message.channel, text: text, as_user: true}  
                bot.api.chat.postMessage(answer, function (err, response) {
                  if (!err) {
                    addReaction(bot, response, 'computer')
                  }
                })
                
              } else {
                bot.reply(message, randomMessage(GENERAL_ERROR_MESSAGES))
                bot.botkit.log('error saving user token', err)
              }
            });
          // the convo did not end with status "completed"
          } else {
            // this happens if the conversation ended prematurely for some reason
            var answer = {channel: message.channel, text: 'Alright. If you want to try again please ask me about `onboarding` or just tap on the :computer:.', as_user: true}  
            bot.api.chat.postMessage(answer, function (err, response) {
              if (!err) {
                addReaction(bot, response, 'computer')
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
    controller.storage.users.get(message.user, function(err, user) {
      // if we don't know that user yet, add a new one with the Slack user ID
      if (!user) {
        user = {
          id: message.user,
        };
      }
      // if the user already has a inthe.am token saved in local storage
      if (user.token && user.token != '') {
        bot.startPrivateConversation(message, function(err, convo) {
          if (!err) {
            convo.say('Looks like I already have a token for you in my dossier.')
            convo.ask('Do you want me to show you the one I have here?', [
              {
                // yes, the user wants to see the current token
                pattern: bot.botkit.utterances.yes,
                callback: function(response, convo) {
                  convo.say('The last token you told me was `' + user.token + '`')
                  convo.ask('Ok, do you want to tell me a new token now?',[
                    {
                      // yes, the user wants to add a new token to local storage now
                      pattern: bot.botkit.utterances.yes,
                      callback: function(response, convo) {
                        // since no further messages are queued after this,
                        // the conversation will end naturally with status == 'completed'
                        newTokenConvo(bot, message, user);
                        convo.next();
                      }
                    },
                    {
                      // no, the user does not want to add a new token now
                      pattern: bot.botkit.utterances.no,
                      callback: function(response, convo) {
                        // we'll just let the convo end here with status "stopped" and handle that later on
                        convo.stop();
                      }
                    },
                    {
                      // anything but yes and no, repeat the question
                      default: true,
                      callback: function(response, convo) {
                        convo.repeat();
                        convo.next();
                      }
                    }
                  ])

                  convo.next();
                }
              },
              {
                // no, the user does not want to see the current token
                pattern: bot.botkit.utterances.no,
                callback: function(response, convo) {
                  convo.ask('Ok, do you want to tell me a new token now?',[
                    {
                      // yes, the user wants to add a new token to local storage now
                      pattern: bot.botkit.utterances.yes,
                      callback: function(response, convo) {
                        // since no further messages are queued after this,
                        // the conversation will end naturally with status == 'completed'
                        newTokenConvo(bot, message, user);
                        convo.next();
                      }
                    },
                    {
                      // no, the user does not want to add a new token now
                      pattern: bot.botkit.utterances.no,
                      callback: function(response, convo) {
                        // we'll just let the convo end here with status "stopped" and handle that later on
                        convo.stop();
                      }
                    },
                    {
                      // anything but yes and no, repeat the question
                      default: true,
                      callback: function(response, convo) {
                        convo.repeat();
                        convo.next();
                      }
                    }
                  ])
                  convo.next()
                }
              },
              {
                // anything but yes and no, repeat the question
                default: true,
                callback: function(response, convo) {
                  convo.repeat();
                  convo.next();
                }
              }
            ])
            
            // if the conversation did not end with the user adding a new token
            convo.on('end', function(convo) {
              if (convo.status == 'stopped') {
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
}

exports.init = init;
