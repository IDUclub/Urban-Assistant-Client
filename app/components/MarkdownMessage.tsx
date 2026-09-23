import { isValidElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

function joinClassNames(...classNames: Array<string | undefined>) {
    return classNames.filter(Boolean).join(" ");
}

function getCodeLanguage(children: ReactNode) {
    if (!isValidElement<{ className?: string }>(children)) return undefined;

    return children.props.className?.match(/(?:^|\s)language-([^\s]+)/)?.[1];
}

const markdownComponents: Components = {
    h1: ({ node: _node, className, ...props }) => (
        <h1
            {...props}
            className={joinClassNames(
                "mt-2 text-2xl font-semibold leading-tight text-gray-950 customer-dark:text-content-primary",
                className
            )}
        />
    ),
    h2: ({ node: _node, className, ...props }) => (
        <h2
            {...props}
            className={joinClassNames(
                "mt-2 text-xl font-semibold leading-tight text-gray-950 customer-dark:text-content-primary",
                className
            )}
        />
    ),
    h3: ({ node: _node, className, ...props }) => (
        <h3
            {...props}
            className={joinClassNames(
                "mt-1 text-lg font-semibold leading-snug text-gray-950 customer-dark:text-content-primary",
                className
            )}
        />
    ),
    h4: ({ node: _node, className, ...props }) => (
        <h4
            {...props}
            className={joinClassNames(
                "mt-1 text-base font-semibold leading-snug text-gray-900 customer-dark:text-content-primary",
                className
            )}
        />
    ),
    h5: ({ node: _node, className, ...props }) => (
        <h5
            {...props}
            className={joinClassNames(
                "mt-1 text-base font-semibold leading-snug text-gray-900 customer-dark:text-content-primary",
                className
            )}
        />
    ),
    h6: ({ node: _node, className, ...props }) => (
        <h6
            {...props}
            className={joinClassNames(
                "mt-1 text-base font-semibold leading-snug text-gray-900 customer-dark:text-content-primary",
                className
            )}
        />
    ),
    p: ({ node: _node, className, ...props }) => (
        <p {...props} className={joinClassNames("whitespace-pre-wrap", className)} />
    ),
    a: ({ node: _node, className, href, ...props }) => {
        const opensNewTab = !!href && !href.startsWith("#");

        return (
            <a
                {...props}
                href={href}
                className={joinClassNames(
                    "font-medium text-blue-600 underline decoration-blue-300 underline-offset-2 transition-colors hover:text-blue-700 customer:text-brand-primary customer:decoration-brand-border customer:hover:text-brand-contrast",
                    className
                )}
                target={opensNewTab ? "_blank" : undefined}
                rel={opensNewTab ? "noreferrer noopener" : undefined}
            />
        );
    },
    blockquote: ({ node: _node, className, ...props }) => (
        <blockquote
            {...props}
            className={joinClassNames(
                "border-l-4 border-slate-300 pl-4 text-slate-700 customer-dark:border-ui-border-strong customer-dark:text-content-secondary",
                className
            )}
        />
    ),
    ul: ({ node: _node, className, ...props }) => (
        <ul
            {...props}
            className={joinClassNames(
                "list-disc space-y-1 pl-6 marker:text-slate-500 customer-dark:marker:text-content-muted",
                className
            )}
        />
    ),
    ol: ({ node: _node, className, ...props }) => (
        <ol
            {...props}
            className={joinClassNames(
                "list-decimal space-y-1 pl-6 marker:font-medium marker:text-slate-600 customer-dark:marker:text-content-secondary",
                className
            )}
        />
    ),
    li: ({ node: _node, className, ...props }) => (
        <li
            {...props}
            className={joinClassNames(
                "pl-1",
                className?.includes("task-list-item") ? "list-none pl-0" : undefined,
                className
            )}
        />
    ),
    input: ({ node: _node, className, type, ...props }) => type === "checkbox" ? (
        <input
            {...props}
            type="checkbox"
            disabled
            className={joinClassNames(
                "mr-2 size-4 align-[-0.15em] accent-blue-600 customer:accent-brand-primary",
                className
            )}
        />
    ) : null,
    hr: ({ node: _node, className, ...props }) => (
        <hr
            {...props}
            className={joinClassNames(
                "my-1 border-0 border-t border-slate-200 customer-dark:border-ui-border",
                className
            )}
        />
    ),
    pre: ({ node: _node, className, children, ...props }) => {
        const language = getCodeLanguage(children);

        return (
            <div className="my-2 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm customer-dark:border-ui-border customer-dark:bg-surface-muted">
                {language ? (
                    <div className="border-b border-slate-200 bg-white px-4 py-2 text-xs font-medium uppercase tracking-[0.12em] text-slate-500 customer-dark:border-ui-border customer-dark:bg-surface-raised customer-dark:text-content-muted">
                        {language}
                    </div>
                ) : null}
                <pre
                    {...props}
                    className={joinClassNames(
                        "overflow-x-auto bg-[#f8f9fa] px-4 py-4 text-sm leading-6 text-[#1f1555] customer-dark:bg-surface-muted customer-dark:text-content-primary [&>code]:rounded-none [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-inherit",
                        className
                    )}
                >
                    {children}
                </pre>
            </div>
        );
    },
    code: ({ node: _node, className, ...props }) => (
        <code
            {...props}
            className={joinClassNames(
                "rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[0.9em] text-[#1f1555] customer-dark:bg-surface-muted customer-dark:text-content-primary",
                className
            )}
        />
    ),
    table: ({ node: _node, className, ...props }) => (
        <div className="my-2 overflow-x-auto">
            <table
                {...props}
                className={joinClassNames(
                    "min-w-full border-collapse overflow-hidden rounded-2xl border border-gray-200 text-left text-sm customer-dark:border-ui-border",
                    className
                )}
            />
        </div>
    ),
    thead: ({ node: _node, className, ...props }) => (
        <thead
            {...props}
            className={joinClassNames(
                "bg-gray-50 customer-dark:bg-surface-muted [&>tr]:bg-gray-400/10 customer-dark:[&>tr]:bg-surface-hover/60",
                className
            )}
        />
    ),
    tbody: ({ node: _node, className, ...props }) => (
        <tbody
            {...props}
            className={joinClassNames(
                "[&>tr:nth-child(odd)]:bg-white [&>tr:nth-child(even)]:bg-gray-50/50 customer-dark:[&>tr:nth-child(odd)]:bg-surface-panel customer-dark:[&>tr:nth-child(even)]:bg-surface-muted/50",
                className
            )}
        />
    ),
    th: ({ node: _node, className, ...props }) => (
        <th
            {...props}
            className={joinClassNames(
                "border-b border-gray-200 px-4 py-3 font-semibold text-gray-900 customer-dark:border-ui-border customer-dark:text-content-primary",
                className
            )}
        />
    ),
    td: ({ node: _node, className, ...props }) => (
        <td
            {...props}
            className={joinClassNames(
                "border-t border-gray-200 px-4 py-3 align-top text-gray-800 customer-dark:border-ui-border customer-dark:text-content-primary",
                className
            )}
        />
    ),
    img: ({ node: _node, className, alt, ...props }) => (
        <img
            {...props}
            alt={alt ?? ""}
            loading="lazy"
            className={joinClassNames("max-h-96 max-w-full rounded-2xl object-contain", className)}
        />
    ),
    del: ({ node: _node, className, ...props }) => (
        <del {...props} className={joinClassNames("text-slate-500 customer-dark:text-content-muted", className)} />
    ),
};

export default function MarkdownMessage({ children }: { children: string }) {
    return (
        <div className="flex min-w-0 flex-col gap-3 break-words">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw, rehypeSanitize]}
                components={markdownComponents}
            >
                {children}
            </ReactMarkdown>
        </div>
    );
}
