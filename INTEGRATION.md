# AI features - 5 small edits to existing files

New files drop in as-is (see the placement list in the chat). These are the
only edits to files you already have. Each is a find -> add.

## 1. components/ChatWindow.js  (Catch me up)

Add near the other imports:

    import CatchMeUp from "./CatchMeUp";

Find this line (just above the messages area, the pinned-message block):

    {pinnedMessage && (

and put THIS directly above it:

    {!isBotChat && <CatchMeUp conversationId={conversation.id} />}

## 2. lib/messages.js  (send the flag to the browser)

In `serializeMessage`, find:

    pinned: !!row.pinned,

and add right after it:

    flagged: !!row.flagged,

## 3. lib/socketServer.js  (run moderation in the background)

Add near the top with the other imports:

    import { moderateMessage } from "./moderation.js";

Find this line in the `send-message` handler:

    io.to(String(conversationId)).emit("new-message", message);

and add right after it:

    if ((type || "text") === "text") {
      // fire-and-forget: never delays delivery
      moderateMessage({
        messageId,
        conversationId,
        text,
        emitToConversation: (event, payload) => io.to(String(conversationId)).emit(event, payload)
      });
    }

(Don't touch the "held back by a block" early return above it - held-back
messages are intentionally not moderated/broadcast.)

## 4. app/chat/page.js  (blur live when a message is flagged)

Find:

    s.on("chats-refresh", () => {

and add this ABOVE it:

    s.on("message-flagged", ({ id, conversation }) => {
      setMessagesByConvo((prev) => ({
        ...prev,
        [conversation]: (prev[conversation] || []).map((m) => (m.id === id ? { ...m, flagged: true } : m))
      }));
    });

In the cleanup list (where the `s.off(...)` calls are), add:

    s.off("message-flagged");

## 5. components/MessageBubble.js  (the blur UI)

Add near the other imports:

    import FlaggedText from "./FlaggedText";

Find (the normal text paragraph):

    {linkify(message.text)}

and replace it with:

    <FlaggedText message={message} isOwn={isOwn} render={linkify} />

(`render={linkify}` keeps links clickable inside the text.)

## Environment variables

    GROQ_API_KEY=...            # already set for Yap AI; also used by Catch me up
    ML_SERVICE_URL=http://localhost:8001   # toxicity service; leave unset to turn moderation off
    ML_SERVICE_KEY=some-long-random-string # same value as the service's ML_SERVICE_KEY
    TOXICITY_THRESHOLD=0.8                 # tune from ml-service/eval results
