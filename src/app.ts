import { App } from '@slack/bolt'
import dotenv from 'dotenv'

dotenv.config()

const credentials: { signingSecret: string; botToken: string; userToken: string } = {
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  botToken: process.env.SLACK_BOT_TOKEN,
  userToken: process.env.SLACK_USER_TOKEN,
}

const settings: {
  taskReaction: string
  userId: string
  doneReactions: string[]
  reportChannel: string
} = {
  taskReaction: process.env.TASK_REACTION,
  userId: process.env.SLACK_USER_ID,
  doneReactions: process.env.DONE_REACTIONS?.split(','),
  reportChannel: process.env.REPORT_CHANNEL,
}

const searchResultMaxCount = 200
type MessageId = { channelId: string; timestamp: string }
type PostMessageParam = { permalink: string; text: string; channel: string }
const getTask = async (): Promise<PostMessageParam[]> => {
  const app = new App({ signingSecret: credentials.signingSecret, token: credentials.userToken })

  const allTasks = await app.client.search.messages({
    token: credentials.userToken,
    query: 'has::' + settings.taskReaction + ':',
    sort: 'timestamp',
    sort_dir: 'desc',
    count: searchResultMaxCount,
  })

  const hasDoneTask: MessageId[] = []
  for (const doneReaction of settings.doneReactions) {
    const doneTasks = await app.client.search.messages({
      token: credentials.userToken,
      query: 'has::' + settings.taskReaction + ': hasmy::' + doneReaction + ':',
      sort: 'timestamp',
      sort_dir: 'desc',
      count: searchResultMaxCount,
    })
    doneTasks.messages.matches.forEach((message) => {
      hasDoneTask.push({ channelId: message.channel.id, timestamp: message.ts })
    })
  }

  const doingTaskMessages: PostMessageParam[] = []
  for (const message of allTasks.messages.matches) {
    let isDone = false
    for (const id of hasDoneTask) {
      if (id.channelId === message.channel.id && id.timestamp === message.ts) {
        isDone = true
        break
      }
    }
    if (!isDone) {
      doingTaskMessages.push({
        permalink: message.permalink,
        text: message.text,
        channel: message.channel.name,
      })
    }
  }
  return doingTaskMessages
}

const contextMaxLength = 60

const postMessage = async (messages: PostMessageParam[]): Promise<void> => {
  const app = new App({ signingSecret: credentials.signingSecret, token: credentials.botToken })
  let messageText = `<@${settings.userId}> All tasks completed :tada:`
  if (messages.length > 0) {
    messageText =
      `<@${settings.userId}> task list\n\n` +
      messages
        .map(
          (message) =>
            `* #${message.channel} <${message.permalink}|${message.text
              .replace(/\r?\n/gm, ' ')
              .replace(/<https?:\/\/([^>]*)>/g, '$1')
              .slice(0, contextMaxLength)
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              }>`
        )
        .join(`\n`)
  }
  await app.client.chat.postMessage({
    token: credentials.botToken,
    channel: settings.reportChannel,
    text: messageText,
    as_user: true,
    username: 'task alert bot',
  })
}

getTask().then((messages) => {
  postMessage(messages).then()
})
