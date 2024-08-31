
let first_ts = null;
export async function botChannelMessage(app, message, say) {
    const isUserMessage =
        message.type === 'message' && !message.subtype && !message.bot_id;

    // await restartSession(message)

    const prompt = message.text.replace(/(?:\s)<@[^, ]*|(?:^)<@[^, ]*/, '')
    let msg = "<@" + message.user + "> 님이 질문하였습니다:\n";
    msg += ">" + message.text + "\n";

    if (isUserMessage && message.text && message.text !== 'reset') {
        console.log('user channel', message.channel);

        const options = {
            channel: message.channel,
            ts: message.ts,
            latest: message.ts,
            inclusive: true,
            include_all_metadata: true,
            limit: 20,
        };

        async function getFirstTs(message) {
            first_ts = message.ts
            return first_ts
        }

        if(!message.parent_user_id || undefined) {
            console.log("스레드 생성 시작!")
            first_ts = await getFirstTs(message)
        }
        else {
            options.ts = first_ts
        }

        console.log(message)
        console.log('부모 ts' , first_ts)
        console.log('자신 ts', message.ts)

        const { messages } = await app.client.conversations.replies(options);

        console.log("MESSAGE: \n" + JSON.stringify(messages, null, 2));

        console.log('숫자' + (messages.length -1))

        const previus = (messages || [])[(messages.length -2)]?.metadata?.event_payload || {
            parentMessageId: undefined,
            conversationId: undefined
        };
        console.log("PREVIUS: \n" + JSON.stringify(previus, null, 2));

        const ms = await say({
            channel: message.channel,
            text: ':thinking_face:',
            thread_ts: message.thread_ts
        });

        console.log("MS: \n" + JSON.stringify(ms, null, 2));


        try {
            const answer = await api.sendMessage(prompt,{
                parentMessageId: previus.parentMessageId,
                conversationId: previus.conversationId,});

            msg += answer.text;

            console.log(`MSG: \n${msg}`);
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
}