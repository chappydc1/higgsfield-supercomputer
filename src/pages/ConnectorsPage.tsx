import { useState } from "react";
import { PanelTopBar } from "@/sections/MainWorkspace/components/PanelTopBar";

interface Connector {
  name: string;
  description: string;
  bg: string;
  text: string;
  letter: string;
}

const leftConnectors: Connector[] = [
  {
    name: "Telegram",
    description: "Telegram is a cloud-based, cross-platform, encrypted instant messaging service.",
    bg: "bg-[#2AABEE]",
    text: "text-white",
    letter: "T",
  },
  {
    name: "Google Docs",
    description: "Google Docs is a cloud-based word processor that allows you to create, read, and update documents programmatically.",
    bg: "bg-[#4285F4]",
    text: "text-white",
    letter: "G",
  },
  {
    name: "Notion",
    description: "Notion",
    bg: "bg-white",
    text: "text-black",
    letter: "N",
  },
  {
    name: "Gmail",
    description: "Gmail is a free email service by Google providing integrated communication tools, organizational features, and powerful search.",
    bg: "bg-[#EA4335]",
    text: "text-white",
    letter: "M",
  },
  {
    name: "Google Calendar",
    description: "Google Calendar is a time-management and scheduling service for organizing events, meetings, and reminders.",
    bg: "bg-[#1A73E8]",
    text: "text-white",
    letter: "C",
  },
  {
    name: "GitHub",
    description: "GitHub is a platform for version control, collaboration, and software development using Git repositories.",
    bg: "bg-[#24292e]",
    text: "text-white",
    letter: "GH",
  },
  {
    name: "OpenAI Whisper",
    description: "Transcribe audio files to text using OpenAI Whisper models (openai-create-transcription only).",
    bg: "bg-[#1a1a1a]",
    text: "text-white",
    letter: "AI",
  },
  {
    name: "Linear",
    description: "Linear is a modern issue tracking and project management tool built for high-performance software teams.",
    bg: "bg-[#5E6AD2]",
    text: "text-white",
    letter: "L",
  },
  {
    name: "Twilio",
    description: "Twilio is a cloud communications platform for building SMS, voice, and messaging applications via API.",
    bg: "bg-[#F22F46]",
    text: "text-white",
    letter: "TW",
  },
  {
    name: "Supabase",
    description: "Supabase is an open-source Firebase alternative providing a PostgreSQL database, authentication, and real-time subscriptions.",
    bg: "bg-[#3ECF8E]",
    text: "text-black",
    letter: "SB",
  },
  {
    name: "Dropbox",
    description: "Dropbox is a cloud-based file hosting service for storing, synchronizing, and sharing files and folders across devices.",
    bg: "bg-[#0061FF]",
    text: "text-white",
    letter: "DB",
  },
  {
    name: "YouTube Analytics",
    description: "YouTube Analytics API provides access to YouTube reporting data including video metrics, channel performance, and audience insights.",
    bg: "bg-[#FF0000]",
    text: "text-white",
    letter: "YT",
  },
  {
    name: "YouTube Data",
    description: "YouTube Data API lets you incorporate YouTube functionality into your applications including searching videos, managing playlists, and retrieving channel information.",
    bg: "bg-[#FF0000]",
    text: "text-white",
    letter: "YT",
  },
  {
    name: "Salesforce",
    description: "Query, create, update, and delete Salesforce records (accounts, contacts, leads, opportunities, cases, campaigns, tasks) plus SOQL/SOSL and Chatter.",
    bg: "bg-[#00A1E0]",
    text: "text-white",
    letter: "SF",
  },
];

const rightConnectors: Connector[] = [
  {
    name: "Google Drive",
    description: "Google Drive is a file storage and synchronization service which allows you to create and share your work online, and access your documents from anywhere.",
    bg: "bg-[#34A853]",
    text: "text-white",
    letter: "GD",
  },
  {
    name: "Microsoft OneDrive",
    description: "Microsoft OneDrive lets you store your personal files in one place, share them with others, and get to them from any device.",
    bg: "bg-[#0078D4]",
    text: "text-white",
    letter: "OD",
  },
  {
    name: "WhatsApp Business",
    description: "WhatsApp Business provides tools for businesses to communicate with customers at scale, supporting messaging, templates, and media sharing on the WhatsApp platform.",
    bg: "bg-[#25D366]",
    text: "text-white",
    letter: "WA",
  },
  {
    name: "Google Sheets",
    description: "Google Sheets is an online spreadsheet application for creating, editing, and sharing spreadsheets with real-time collaboration and insights from any device.",
    bg: "bg-[#0F9D58]",
    text: "text-white",
    letter: "GS",
  },
  {
    name: "Slack",
    description: "Slack is the AI-powered platform for work bringing all of your conversations, apps, and customers together in one place.",
    bg: "bg-[#4A154B]",
    text: "text-white",
    letter: "SL",
  },
  {
    name: "Discord Bot",
    description: "Discord is a communication platform for communities, gaming, and teams with text, voice, and video channels.",
    bg: "bg-[#5865F2]",
    text: "text-white",
    letter: "DC",
  },
  {
    name: "HubSpot",
    description: "HubSpot's CRM platform contains marketing, sales, service, operations, and website-building software to help grow your business.",
    bg: "bg-[#FF7A59]",
    text: "text-white",
    letter: "HS",
  },
  {
    name: "Jira",
    description: "Jira is a project tracking and issue management tool by Atlassian for agile software development teams.",
    bg: "bg-[#0052CC]",
    text: "text-white",
    letter: "JR",
  },
  {
    name: "SendGrid",
    description: "SendGrid is a cloud-based email delivery platform for transactional and marketing emails at scale.",
    bg: "bg-[#1A82E2]",
    text: "text-white",
    letter: "SG",
  },
  {
    name: "Todoist",
    description: "Todoist is a task management and to-do list application for organizing work and personal tasks.",
    bg: "bg-[#DB4035]",
    text: "text-white",
    letter: "TD",
  },
  {
    name: "Microsoft Outlook",
    description: "Microsoft Outlook is an email and calendar service for sending, receiving, and organizing emails, managing contacts, and scheduling events.",
    bg: "bg-[#0078D4]",
    text: "text-white",
    letter: "OL",
  },
  {
    name: "Vimeo",
    description: "Vimeo is a video hosting, sharing, and streaming platform with tools for uploading, managing, and monetizing video content.",
    bg: "bg-[#1AB7EA]",
    text: "text-white",
    letter: "VI",
  },
  {
    name: "Frame.io",
    description: "Search assets, create projects/assets, and post comments on Frame.io video review.",
    bg: "bg-[#1F1F1F]",
    text: "text-white",
    letter: "FR",
  },
];

interface ConnectorRowProps {
  connector: Connector;
}

const ConnectorRow = ({ connector }: ConnectorRowProps) => (
  <div className="flex items-center gap-3 h-16 px-3 rounded-lg hover:bg-white/5 transition-colors group">
    <div
      className={`w-10 h-10 rounded-full ${connector.bg} ${connector.text} flex items-center justify-center text-xs font-bold shrink-0`}
    >
      {connector.letter}
    </div>
    <div className="flex flex-col flex-1 min-w-0">
      <span className="text-white text-sm font-medium leading-tight">{connector.name}</span>
      <span className="text-white/50 text-xs truncate leading-tight mt-0.5">{connector.description}</span>
    </div>
    <button
      type="button"
      className="shrink-0 w-7 h-7 rounded-full border border-white/20 flex items-center justify-center text-white/50 hover:text-white hover:border-white/50 transition-colors text-base leading-none"
      aria-label={`Install ${connector.name}`}
    >
      +
    </button>
  </div>
);

export const ConnectorsPage = () => {
  const [activeTab, setActiveTab] = useState<"available" | "installed">("available");
  const [search, setSearch] = useState("");

  const filterConnectors = (list: Connector[]) => {
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
    );
  };

  const filteredLeft = filterConnectors(leftConnectors);
  const filteredRight = filterConnectors(rightConnectors);

  return (
    <div className="relative flex flex-col flex-1 min-h-0 bg-[#131517]">
      <PanelTopBar activePage="connectors" />

      {/* Main area */}
      <div className="flex flex-col flex-1 min-h-0 items-center px-8 py-6 gap-6">
        {/* Top icons */}
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-[#34A853] flex items-center justify-center text-white text-xl font-bold shadow-lg">
            GD
          </div>
          <div className="w-14 h-14 rounded-2xl bg-[#1a1a1a] border border-white/10 flex items-center justify-center text-white text-xl font-bold shadow-lg">
            AI
          </div>
          <div className="w-14 h-14 rounded-2xl bg-[#4285F4] flex items-center justify-center text-white text-xl font-bold shadow-lg">
            G
          </div>
        </div>

        {/* Heading */}
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-[#f7f7f8] text-2xl font-semibold tracking-tight">Install Connectors</h1>
          <p className="text-[#898a8b] text-sm">for context in Supercomputer</p>
        </div>

        {/* Tabs + Search row */}
        <div className="flex items-center justify-between w-full max-w-3xl">
          <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab("available")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === "available"
                  ? "bg-white/10 text-white"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              Available
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("installed")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === "installed"
                  ? "bg-white/10 text-white"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              Installed
            </button>
          </div>

          <div className="relative">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder-white/30 focus:outline-none focus:border-white/20 w-44"
            />
          </div>
        </div>

        {/* Content */}
        {activeTab === "available" && (
          <div className="flex-1 min-h-0 w-full max-w-3xl overflow-y-auto">
            <div className="grid grid-cols-2 gap-x-4">
              <div className="flex flex-col">
                {filteredLeft.map((connector) => (
                  <ConnectorRow key={connector.name} connector={connector} />
                ))}
              </div>
              <div className="flex flex-col">
                {filteredRight.map((connector) => (
                  <ConnectorRow key={connector.name} connector={connector} />
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "installed" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-white/5 border border-white/10">
              <svg
                className="w-6 h-6 text-white/20"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <p className="text-white/30 text-sm">No connectors installed yet</p>
            <button
              type="button"
              onClick={() => setActiveTab("available")}
              className="text-cyan-400 text-sm hover:text-cyan-300 transition-colors"
            >
              Browse available connectors
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
