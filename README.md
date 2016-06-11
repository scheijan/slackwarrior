# Slackwarrior

[![Join the chat at https://gitter.im/scheijan/slackwarrior](https://badges.gitter.im/scheijan/slackwarrior.svg)](https://gitter.im/scheijan/slackwarrior?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

Leveraging the powers of [Taskwarrior](http://taskwarrior.org) and [inthe.am](https://inthe.am) Slackwarrior can assist you managing your tasks on Slack.

**Work in progress disclaimer:** 
The bot is currently under development and you'll only be able to run it yourself (no Slackapp yet). 


## Prerequisites ##
Slackwarior is based on the awesome [botkit](https://github.com/howdyai/botkit) library for Slackbot.
He also makes use of [moment.js](https://momentjs.com) and [date.js](https://date.js.org) to provide human readable dates.
And he uses [dashbot.io](https://dashbot.io) to learn more about the users' needs.

## Setup ##
Clone this repository and call
```npm i```
to install all necessary node modules.

## Operation ##
You will need two environment variables, one for your Slack API token (`token`) and one for your [dashbot.io](https://dashbot.io) API key (`DASHBOT_API_KEY`). So to start the bot you can use something like 
```DASHBOT_API_KEY=AbCdEfGhIjKlMnOpQrStUvWxYz01234567890235 token=asdf-01234567890-aBcDeFgHiJkLmNoPqRsTuVwX node slackwarrior.js```
to start the bot.

## Contributing ##
Help is always welcome! If you are interested, please get in touch on our [Slack]
(http://slackin.scheijan.net) 