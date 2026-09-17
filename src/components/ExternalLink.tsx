import * as React from 'react';
export function ExternalLink({href,children,code,title}:{href?:string;children:React.ReactNode;code?:boolean;title?:string}) {
 const content=<span className={code?'trace-code':undefined}>{children}</span>;
 if(!href) return content;
 return <a href={href} title={title} target='_blank' rel='noopener noreferrer' className='trace-link'>{content}<i className='fa fa-external-link-alt trace-external-icon' aria-hidden='true'/></a>;
}
