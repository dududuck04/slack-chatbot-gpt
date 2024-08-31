import {api, updateMessage} from "./index.mjs";

let isUpdating = false;
let event_first_ts;

export function botMentionMessage(app){
    app.event('app_mention', async ({ event, say }) => {

        const prompt = event.text.replace(/(?:\s)<@[^, ]*|(?:^)<@[^, ]*/, '');
        let msg = "<@" + event.user + "> 님이 질문하였습니다: \n";
        msg += ">" + prompt + "\n";

        const options = {
            channel: event.channel,
            ts: event.ts,
            latest: event.ts,
            inclusive: true,
            include_all_metadata: true,
            limit: 20,
        };

        async function getFirstTs(event) {
            event_first_ts = event.ts;
            return event_first_ts;
        }

        if (!event.parent_user_id || undefined) {
            event_first_ts = await getFirstTs(event)
        } else {
            options.ts = event_first_ts;
        }

        let { messages } = await app.client.conversations.replies(options);

        messages.filter(message => message.thread_ts === event_first_ts)

        console.log("MESSAGE: \n" + JSON.stringify(messages, null, 2));


        const previus = (messages || [])[(messages.length -2)]?.metadata?.event_payload || {
            parentMessageId: undefined,
            conversationId: undefined
        };

        console.log("PREVIUS: \n" + JSON.stringify(previus, null, 2));


        const ms = await say({
            channel: event.channel,
            text: ':thinking_face: 프로세스가 처리되는 동안 잠시 기다려주세요.',
            thread_ts: event.ts
        });

        if (!isUpdating) {
            isUpdating = true;

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
            } finally {
                isUpdating = false;
            }
        }

    });

}
