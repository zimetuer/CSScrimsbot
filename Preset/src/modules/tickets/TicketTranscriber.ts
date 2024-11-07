import {
    Attachment,
    AttachmentBuilder,
    AttachmentData,
    Collection,
    EmbedBuilder,
    Guild,
    Message,
    TextChannel,
    codeBlock,
    time,
    userMention,
} from "discord.js"

import discordTranscripts, { ExportReturnType } from "discord-html-transcripts"
import { writeFile } from "fs/promises"
import { unlink } from 'fs/promises';
import path from "path"

import { Colors, Emojis } from "@Constants"
import { Config, DiscordUtil, ScrimsBot, TextUtil, Ticket, request } from "lib"

export interface TicketTranscriberOptions {
    dmUsers?: boolean
}

ScrimsBot.useBot((bot) => {
    Object.defineProperty(TicketTranscriber, "bot", { value: bot })
})

Config.declareTypes(["Attachment Locking Channel"])

export default class TicketTranscriber {
    private static readonly bot: ScrimsBot
    constructor(protected readonly options: TicketTranscriberOptions = {}) {}

    protected get bot() {
        return TicketTranscriber.bot
    }

    protected async lockAttachment(attachment: Attachment, guild: Guild, msg?: string) {
        try {
            const file = await request(attachment.proxyURL, { timeout: 5000 }).then((r) => r.arrayBuffer())
            if (file.byteLength / 1000000 > 8) throw new Error(`${file.byteLength / 1000000} MB is too large`)
            const lockedFile = new AttachmentBuilder(Buffer.from(file), attachment as AttachmentData)

            const channelId = this.bot.getConfigValue("Attachment Locking Channel", guild.id)
            if (!channelId) throw new Error("Channel not configured")
            const channel = await guild.channels.fetch(channelId)
            if (!channel?.isTextBased()) throw new Error("Channel not available")
            const locked = await channel
                .send({ content: msg, files: [lockedFile] })
                .then((m) => m.attachments.first())
            if (!locked) throw new Error("Where did the attachment go?")
            locked.id = attachment.id
            return locked
        } catch (err) {
            throw new Error(`Attachment Locking failed! (${err})`)
        }
    }

    async generateTextTranscript(ticket: Ticket, guild: Guild, channel?: TextChannel | null) {
        if (!channel)
            channel = (await this.bot.channels
                .fetch(ticket.channelId)
                .catch(() => null)) as TextChannel | null

        if (!channel) return

        const messages = await DiscordUtil.completelyFetch(channel.messages).then((v) =>
            v.sort((a, b) => a.createdTimestamp - b.createdTimestamp),
        )

        await this.lockAttachments(messages, guild)

        // Generating plain text transcript instead of HTML
        let transcriptContent = messages.map(m => {
            const timestamp = new Date(m.createdTimestamp).toLocaleString()
            return `[${timestamp}] ${m.author.username}: ${m.content}`
        }).join("\n")

        for (const [name, unicode] of Object.entries(Emojis)) {
            transcriptContent = transcriptContent.replaceAll(`:${name}:`, unicode)
        }

        // Save the transcript to a .txt file
        const transcriptFilePath = path.join(".", "transcripts", `${ticket.id}.txt`)
        await writeFile(transcriptFilePath, transcriptContent)

        // Return the path to the saved transcript
        return transcriptFilePath
    }

    async lockAttachments(messages: Collection<string, Message<true>>, guild: Guild) {
        await Promise.all(
            Array.from(messages.values()).flatMap((m) =>
                m.attachments.map((a) =>
                    this.lockAttachment(a, guild, `${a.name} **FROM #${m.channel.name}**`)
                        .then((locked) => m.attachments.set(a.id, locked))
                        .catch(console.debugError),
                ),
            ),
        )
    }

    getUserMessageEmbed(ticket: Ticket) {
        const guild = this.bot.guilds.cache.get(ticket.guildId)
        return new EmbedBuilder()
            .setColor(Colors.ScrimsRed)
            .setTitle(`${ticket.type} Ticket Transcript`)
            .setDescription(
                `Your ${ticket.type.toLowerCase()} ticket from ${time(ticket.createdAt, "f")} was closed. ` +
                `Attached is the transcript of your ${ticket.type.toLowerCase()} channel. ` +
                `Have a nice day :cat2:,`
            )
            .addFields(
                ticket.closeReason ? [{ name: "Close Reason", value: codeBlock(ticket.closeReason) }] : [],
            )
            .setFooter(guild ? { text: guild.name, iconURL: guild.iconURL() ?? undefined } : null)
    }

    getLogMessageEmbed(ticket: Ticket) {
        return new EmbedBuilder()
            .setColor(Colors.White)
            .setTitle(`${ticket.type} Ticket Transcript`)
            .setDescription(
                `• Created by ${userMention(ticket.userId)} ${time(ticket.createdAt, "R")}` +
                `\n• Closed by ${ticket.closerId ? userMention(ticket.closerId) : this.bot?.user}` +
                (ticket.closeReason ? ` (${ticket.closeReason})` : "") +
                `\n• Duration: ${TextUtil.stringifyTimeDelta(
                    (Date.now() - ticket.createdAt.valueOf()) / 1000,
                )}`
            )
            .setFooter({ text: `ID: ${ticket.id}` })
    }

    async send(guild: Guild, ticket: Ticket, channel?: TextChannel | null) {
        const transcriptFilePath = await this.generateTextTranscript(ticket, guild, channel);
        if (!transcriptFilePath) return;
    
        // Create an attachment for the transcript file
        const attachment = new AttachmentBuilder(transcriptFilePath);
    
        try {
            // Send the transcript file to the transcript channel
            const channelId = this.bot.getConfigValue(`${ticket.type} Transcripts Channel`, guild.id);
            if (channelId) {
                const transcriptChannel = await guild.channels.fetch(channelId).catch(() => null);
                if (transcriptChannel?.isTextBased()) {
                    await transcriptChannel.send({
                        files: [attachment],
                        embeds: [this.getLogMessageEmbed(ticket)]
                    }).catch(console.error);
                }
            }
    
            // Send the transcript file to the user if needed
            if (this.options.dmUsers && ticket.userId) {
                const user = await guild.client.users.fetch(ticket.userId).catch(() => null);
                if (user) {
                    await user.send({
                        files: [attachment], // Attach the transcript file here
                        embeds: [this.getUserMessageEmbed(ticket)]
                    }).catch(() => null);
                }
            }
        } catch (error) {
            console.error('Error sending transcript or deleting file:');
        } finally {
            // Delete the local transcript file
            try {
                await unlink(transcriptFilePath);
            } catch (deleteError) {
                console.error('Failed to delete the transcript file:');
            }
        }
    }
}
