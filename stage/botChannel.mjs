import {api, updateMessage} from "./index.mjs";

let first_ts;
export function botChannelMessage(app){
    app.message(async ({ message, say }) => {
        const isUserMessage =
            message.type === 'message' && !message.subtype && !message.bot_id;

        // await restartSession(message)

        const prompt = message.text.replace(/(?:\s)<@[^, ]*|(?:^)<@[^, ]*/, '')
        let msg = "<@" + message.user + "> 님이 질문하였습니다:\n";
        msg += ">" + message.text + "\n";

        if (isUserMessage && message.text && message.text !== 'reset') {

            // const { messages } = await app.client.conversations.history({
            //     channel: message.channel,
            //     latest: message.ts,
            //     inclusive: true,
            //     include_all_metadata: true,
            //     limit: 20,
            // });

            const options = {
                channel: message.channel,
                ts: message.ts,
                latest: message.ts,
                inclusive: true,
                include_all_metadata: true,
                limit: 20,
            };

            async function getFirstTs(message) {
                first_ts = message.ts;
                return first_ts;
            }

            if (!message.parent_user_id || undefined) {
                console.log('thread started')
                first_ts = await getFirstTs(message)
            }
            else {
                options.ts = first_ts
            }

            console.log(message.thread_ts)
            console.log(first_ts)

            const { messages } = await app.client.conversations.replies(options);

            messages.filter(message => message.thread_ts === first_ts)

            console.log("MESSAGE: \n" + JSON.stringify(message, null, 2));


            const previus = (messages || [])[(messages.length -2)]?.metadata?.event_payload || {
                parentMessageId: undefined,
                conversationId: undefined
            };

            console.log(previus)

            const ms = await say({
                channel: message.channel,
                text: ':thinking_face: 프로세스가 처리되는 동안 잠시 기다려주세요.',
                thread_ts: message.ts
            });

            try {
                const answer = await api.sendMessage(prompt,{
                    parentMessageId: previus.parentMessageId,
                    conversationId: previus.conversationId,});


                msg += answer.text;


                await updateMessage({
                    channel: ms.channel,
                    ts: ms.ts,
                    text: `${msg} 🔚`,
                    payload: answer
                });

            } catch (error) {
                console.error(error);

                if (error instanceof Error) {
                    await app.client.chat.update({
                        channel: ms.channel,
                        ts: ms.ts,
                        text: `⚠️ ${error.toString()}`,
                    });
                }
            }
        }
    });
}


