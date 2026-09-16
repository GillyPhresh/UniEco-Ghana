'use client';

import { Section, Reveal } from '@/components/landing/section';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const faqs = [
  {
    question: 'What is UniEco Ghana?',
    answer:
      'UniEco Ghana is a campus marketplace and community platform that connects students, businesses, and opportunities across tertiary institutions in Ghana. It launched first at the University of Energy and Natural Resources (UENR) and is expanding to more universities.',
  },
  {
    question: 'Do I need to be a UENR student to use it?',
    answer:
      'UniEco Ghana is rolling out university by university. UENR is the first enabled campus. As more institutions come online, students from those universities will be able to join. External vendors near an enabled campus can also register.',
  },
  {
    question: 'Is it free to create an account?',
    answer:
      'Yes. Creating a student or vendor account is completely free. Vendors can optionally upgrade to premium plans for enhanced visibility and features in the future.',
  },
  {
    question: 'How does verification work?',
    answer:
      'Vendors can earn a verified badge by completing profile verification. Students can verify their enrollment with their university-issued student ID number, unlocking a verified student status.',
  },
  {
    question: 'Can I sell things as a student?',
    answer:
      'Absolutely. Students can register as student vendors and list products or services — from food and fashion to printing and tutoring. It is one of the fastest ways to start a campus business.',
  },
  {
    question: 'Is my data safe?',
    answer:
      'Yes. Each university operates in its own isolated data boundary protected by row-level security. Your personal information is never shared with other users without your consent.',
  },
];

export function FAQ() {
  return (
    <Section id="faq">
      <Reveal>
        <div className="mx-auto max-w-3xl">
          <div className="text-center">
            <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
              FAQ
            </span>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Frequently asked questions
            </h2>
            <p className="mt-4 text-base text-muted-foreground">
              Everything you need to know about UniEco Ghana. Cannot find an
              answer? Reach out to our team.
            </p>
          </div>

          <Accordion type="single" collapsible className="mt-10">
            {faqs.map((faq, i) => (
              <AccordionItem
                key={faq.question}
                value={`item-${i}`}
                className="border-border"
              >
                <AccordionTrigger className="text-left text-base font-medium text-foreground hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </Reveal>
    </Section>
  );
}
