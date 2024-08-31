import Slack from "@slack/bolt"
import { ChatGPTAPI } from 'chatgpt'
// import { ChatGPTUnofficialProxyAPI } from 'chatgpt'
import debounce from 'debounce-promise';
import {Blocks, Message} from "slack-block-builder";
import {botChannelMessage} from "./botMention.mjs";

let isUpdating = false;
let event_first_ts = null;
let initialTimestamp = null;

// 유료 버전
const api = new ChatGPTAPI({
    apiKey: process.env.OPENAI_API_KEY,
    completionParams: {
        frequency_penalty: 0,
        presence_penalty: 0
    }
});


// 무료 버전
// const api = new ChatGPTUnofficialProxyAPI({
//     accessToken: process.env.OPENAI_API_KEY,
//     completionParams: {
//         frequency_penalty: 0,
//         presence_penalty: 0
//     }
// });

const awsLambdaReceiver = new Slack.AwsLambdaReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const app = new Slack.App({
    token: process.env.SLACK_APP_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    receiver: awsLambdaReceiver,
    processBeforeResponse: true,
});

const updateMessage = debounce(async ({ channel, ts, text, payload }) => {

    console.log("PAYLOAD: \n" + JSON.stringify(payload, null, 2));

    let result = await app.client.chat.update({
        channel: channel,
        ts: ts,
        text: text,
        metadata: payload ? {
            event_type: "chat_gpt",
            event_payload: payload
        } : undefined
    });

    console.log("RESULT: \n" + JSON.stringify(result, null, 2));

    // if(payload.detail.object === "chat.completion") {
    //     console.log("finish process")
    //     session_status = false

    // }
}, 1000);


app.event('app_mention', async ({ event, say, }) => {
    console.log('app_mention channel', event.channel);
    console.log("EVENT: \n" + JSON.stringify(event, null, 2));

    const question = event.text.replace(/(?:\s)<@[^, ]*|(?:^)<@[^, ]*/, '');
    console.log(question)

    const options = {
        channel: event.channel,
        ts: event.ts,
        latest: event.ts,
        inclusive: true,
        include_all_metadata: true,
        limit: 20,
    };

    // if(question.toString() === 'reset'){
    //     console.log('reset start!')
    //     await app.message(question, async ({ message, say }) => {
    //         console.log('reset channel', message.channel);
    //
    //         await say({
    //             channel: message.channel,
    //             text: 'I reset your session',
    //         });
    //     });
    // }

    if(!event.thread_ts || null) {

        const ms = await say({
            channel: event.channel,
            text: ':thinking_face:',
            thread_ts: event.ts
        });

        if (!isUpdating) {
            isUpdating = true;

            try {
                const answer = await api.sendMessage(question);

                let msg = "<@" + event.user + "> 님이 질문하셨습니다: \n";
                msg += ">" + question + "\n";
                msg += answer.text;

                await updateMessage({
                    channel: ms.channel,
                    ts: ms.ts,
                    text: `${msg} 🔚`,
                    payload: answer
                });

            } catch(err) {
                if (error instanceof Error) {
                    await app.client.chat.update({
                        channel: ms.channel,
                        ts: ms.ts,
                        text: `⚠️ ${error.toString()}`,
                    });
                }
            } finally {
                isUpdating = false;
            }
        }

    } else {
        app.message(async ({ message, say }) => {
            await botChannelMessage(app, message, say);
        });

    }

    // const answer = await api.sendMessage(question, {
    //     // Real-time update
    //     onProgress: async (answer) => {
    //         await updateMessage({
    //             channel: ms.channel,
    //             ts: ms.ts,
    //             text: answer.text,
    //         });
    //     },
    // });

});

app.message('reset', async ({ message, say }) => {
    console.log('reset channel', message.channel);

    await say({
        channel: message.channel,
        text: 'I reset your session',
    });
});

app.message(async ({ message, say }) => {
    await botChannelMessage(app, message, say);
});

app.error((error) => {
    console.error(error);

    return Promise.resolve();
});

export const timeoutMessageView = ( channel )  => {
    return Message({ channel: channel , text: ' ❗세션이 종료되었습니다. 새로운 스레드를 만들어주세요.'})
        .blocks(
            Blocks.Section({ text: '❗세션이 종료되었습니다. 새로운 스레드를 만들어주세요.'})
        )
        .asUser()
        .buildToObject();
};

async function timeoutFunction(event){
    console.log("EVENT111: \n" + JSON.stringify(event, null, 2));

    const error_message_payload = await app.client.chat.postMessage(timeoutMessageView(JSON.parse(event.user_id)))
    console.log("ERROR: \n" + JSON.stringify(error_message_payload, null, 2));
}

async function restartSession(message){

    if (initialTimestamp === null){
        initialTimestamp = parseInt(message.ts).toFixed(0);
        console.log('start: ',initialTimestamp)
    } else {
        let currentTimestamp = parseInt((Date.now() / 1000).toFixed(0))
        console.log('current: ',currentTimestamp)
        if ((initialTimestamp + 27) - currentTimestamp < 0){
            console.log('session restart')
            // initialTimestamp = parseInt(event.headers['X-Slack-Request-Timestamp']);
            initialTimestamp = initialTimestamp = parseInt(message.ts).toFixed(0);
            console.log('newInitialTimeStamp', initialTimestamp)
            return app.message(async ({say}) => {
                const timeoutMessage = await say({
                    channel: message.user,
                    text: '세션이 연장되었습니다.',
                    thread_ts:message.ts
                })
                console.log('timeout: ', timeoutMessage)
            });
        }
    }
}



export const handler = async (event, context, callback) => {

    console.log("EVENT: \n" + JSON.stringify(event, null, 2));
    console.log("CONTEXT: \n" + JSON.stringify(context, null, 2));

    try{
        if(event.headers['X-Slack-Retry-Num']) {
            return { statusCode: 200, body: "ok" }
        }
        const handler = await awsLambdaReceiver.start();

        return handler(event, context, callback);

    } catch (err){
        console.log('err: ', err)
        throw err;
    }

}