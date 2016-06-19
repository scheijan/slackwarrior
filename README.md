# Slackwarrior

[![Slack Status](https://slackin.slackwarrior.org/badge.svg)](https://slackin.slackwarrior.org)
[![Join the chat at https://gitter.im/scheijan/slackwarrior](https://badges.gitter.im/scheijan/slackwarrior.svg)](https://gitter.im/scheijan/slackwarrior?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![dependency status](https://david-dm.org/scheijan/slackwarrior.svg)](https://david-dm.org/scheijan/slackwarrior.svg)

Leveraging the powers of [Taskwarrior](http://taskwarrior.org) and [inthe.am](https://inthe.am), Slackwarrior can assist you managing your tasks on Slack.

For detailed information on how to use his services check [the docs](https://slackwarrior.org/doc.html).

**Work in progress disclaimer:** 
The bot is currently under development. If you encounter any problems, find a bug or have any suggestions or feature requests, please tell us on our [Slack](https://slackin.slackwarrior.org) or open an issue here on GitHub.

## Prerequisites ##
Slackwarior is based on the awesome [botkit](https://github.com/howdyai/botkit) library for Slackbots.
He also makes use of [moment.js](https://momentjs.com) and [date.js](https://date.js.org) to provide human readable dates. [Bluebird](https://bluebirdjs.com) is used for promises and he uses [dashbot.io](https://dashbot.io) to learn more about the users' needs.

## Setup ##
Clone this repository and call
```npm i```
to install all necessary node modules.

## Operation ##
You will need four environment variables, one for your Slack `clientId`, one for your Slack `clientSecret`, one for your [dashbot.io](https://dashbot.io) API key (`DASHBOT_API_KEY`) and another one for the `port` you want to use for OAuth. So to start the bot you can use something like 

```clientId=01234567890.01234567890 clientSecret=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6 port=23232 DASHBOT_API_KEY=AbCdEfGhIjKlMnOpQrStUvWxYz01234567890235 node slackwarrior.js```

## Contributing ##
Help is always welcome! If you are interested, please get in touch on our [Slack]
(https://slackin.slackwarrior.org).
