import bolt from "@slack/bolt"
import { ChatGPTAPI } from 'chatgpt'
import debounce from 'debounce-promise';
import {botChannelMessage} from "../dev/botChannel.mjs";
import {botMentionMessage} from "./botMention.mjs";

// 유료 버전
export const api = new ChatGPTAPI({
    apiKey: process.env.OPENAI_API_KEY,
    completionParams: {
        frequency_penalty: 0,
        presence_penalty: 0
    }
});

await function updateMessage(app){
    debounce(async ({ channel, ts, text, payload }) => {
        await app.client.chat.update({
            channel: channel,
            ts: ts,
            text: text,
            metadata: payload ? {
                event_type: "chat_gpt",
                event_payload: payload
            } : undefined
        });

    }, 1000);
}

await function sayMessage(app){
    app.message('reset', async ({ message, say }) => {

        await say({
            channel: message.channel,
            text: 'I reset your session',
        });
    });
}

function errorMessage(app) {
    app.error((error) => {
        console.error(error);
        return Promise.resolve();
    });

}

async function restartSession(obj){

    let initialTimestamp = null;

    if (!obj.parent_user_id || undefined) {
        console.log("restart session");
        initialTimestamp = await getFirstTs(obj, initialTimestamp)
    } else {

        let currentTimestamp = parseInt((Date.now() / 1000).toFixed(0))
        console.log('current: ',currentTimestamp)

        if ((initialTimestamp + 27) - currentTimestamp < 0){

            console.log('session restart')

            initialTimestamp = obj.ts
            console.log('newInitialTimeStamp', initialTimestamp)

            return app.message(async ({say}) => {
                const timeoutMessage = await say({
                    channel: obj.channel,
                    text: '세션이 연장되었습니다.',
                    thread_ts: obj.ts
                })
                console.log('timeout: ', timeoutMessage)
            });
        }
    }
}


export default class Slack {
    /**
     * AWS Lambda 함수 실행시 전달되는 Event Object
     */
        // private property #
    #lambdaEvent;
    /**
     * AWS Lambda 함수 실행시 전달되는 Context Object
     */
    #lambdaContext;
    /**
     * AWS Lambda 함수 실행시 전달되는 Callback Function
     */
    #lambdaCallback;
    /**
     * Slack App에서 발급한 Signing Secret Key
     */
    #signingSecret;
    /**
     * Slack App에서 발급한 Token.
     */
    #token;
    /**
     * Slack Modal 창을 통해 Sandbox Parameter입력이 될 경우 처리할 Handler Function.
     */
    #submitHandler;

    /**
     * 생성자 함수.
     *
     * @param {Object} config - Slack 클래스 사용에 필요한 Parameter.
     * @param {string} config.lambdaEvent - Lambda의 함수 Handler에 전달되는 Event Object
     * @param {string} config.lambdaContext - Lambda의 함수 Handler에 전달되는 Context Object
     * @param {function} config.lambdaCallback - Lambda의 함수 Handler에 전달되는 Callback Function
     * @param {string} config.signingSecret - Slack App Signing Secret Key
     * @param {string} config.token - Slack App Token.
     * @param {function} config.submitHandler - Slack Modal 창을 통해 Sandbox Parameter입력이 될 경우 처리할 Callback Function.
     */
    constructor(
        config = {
            lambdaEvent: null,
            lambdaContext: null,
            lambdaCallback: null,
            signingSecret: null,
            token: null,
            submitHandler: null,
        }
    ) {
        this.#lambdaEvent = config.lambdaEvent;
        this.#lambdaContext = config.lambdaContext;
        this.#lambdaCallback = config.lambdaCallback;
        this.#signingSecret = config.signingSecret;
        this.#token = config.token;
        this.#submitHandler = config.submitHandler;
    }

    /**
     * Slack Event 처리를 시작하는 함수
     * @returns {Promise<*>} Bolt.js의 AwsLambdaReceiver.start() return.
     */
    async start() {
        // Initialize your custom receiver
        const awsLambdaReceiver = new bolt.AwsLambdaReceiver({
            signingSecret: this.#signingSecret,
        });

        "LAMBDARECEIVER: \n" + JSON.stringify(awsLambdaReceiver, null, 2);

        // Create a new instance of the App class for building Slack apps and the argument passed in the constructor
        const app = new bolt.App({
            // Set the slack app authorization token
            token: this.#token,
            // to create your own app for receiving and processing events from Slack, such as messages, reactions, and app mentions
            receiver: awsLambdaReceiver,
        });

        await botChannelMessage(app);
        await botMentionMessage(app);

        // Asynchronous function to initialize Slack code. ex) AWSLambdaReceiver
        try {
            // Start the AWS Lambda receiver
            const slackReceiver = await awsLambdaReceiver.start();
            return slackReceiver(
                this.#lambdaEvent,
                this.#lambdaContext,
                this.#lambdaCallback
            );
        } catch (err) {
            console.log("slack error : ", err);
            return err;
        }
    }
}





async function initSlack(event, context, callback ) {
    const slack = new Slack( {
        lambdaEvent: event,
        lambdaContext: context,
        lambdaCallback: callback,
        signingSecret: process.env.SLACK_SIGNING_SECRET,
        token:process.env.SLACK_APP_TOKEN,
        submitHandler: async (event) => {
            await restartSession(event);
            console.log("SESSION: \n" + JSON.stringify("SESSION 재 시작됨!!", null, 2));
        },
    })
    return slack.start();
}

export const handler = async (event, context, callback) => {
    try{
        if(event.headers['X-Slack-Retry-Num']) {
            return { statusCode: 200, body: "ok" }
        }

        // When a Lambda function is triggered, this function will be executed
        const slackResult = await initSlack(event, context, callback);
        console.log(`SLack result: \n${JSON.stringify(slackResult)}`);
        return slackResult;

    } catch (err){
        console.log('err: ', err)
        throw err;
    }

}