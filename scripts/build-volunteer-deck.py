"""
Slides for a room of volunteers, not a room of developers.

Rules this follows, which are the same rules the app follows:
  - Big type. The audience is frequently in their seventies, and a village hall
    projector is not a monitor. Nothing below 20pt.
  - One idea per slide. A slide that needs reading is a slide nobody reads.
  - Say what changes for them, not how it was built. Nobody volunteered to hear
    about IndexedDB.
  - The museum's own colours: registration ink, archival board, the brass tag.
"""
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

INK        = RGBColor(0x16, 0x28, 0x3C)
INK_SOFT   = RGBColor(0x46, 0x58, 0x6C)
BOARD      = RGBColor(0xE8, 0xEC, 0xEF)
PAPER      = RGBColor(0xFF, 0xFF, 0xFF)
BRASS      = RGBColor(0xC9, 0xA2, 0x27)
SAGE       = RGBColor(0x3F, 0x6B, 0x57)
ALERT      = RGBColor(0xA3, 0x3B, 0x32)

DISPLAY = "Georgia"
BODY    = "Calibri"

prs = Presentation()
prs.slide_width  = Inches(13.333)
prs.slide_height = Inches(7.5)
BLANK = prs.slide_layouts[6]

def slide(bg=BOARD):
    s = prs.slides.add_slide(BLANK)
    s.background.fill.solid()
    s.background.fill.fore_color.rgb = bg
    return s

def text(s, txt, left, top, width, height, size=28, colour=INK, font=BODY,
         bold=False, align=PP_ALIGN.LEFT, space_after=10, line=1.25):
    box = s.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
    tf = box.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = MSO_ANCHOR.TOP
    for i, para in enumerate(txt.split("\n")):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.text = para
        p.alignment = align
        p.space_after = Pt(space_after)
        p.line_spacing = line
        for r in p.runs:
            r.font.size = Pt(size); r.font.color.rgb = colour
            r.font.name = font; r.font.bold = bold
    return box

def tag(s, label, top=0.45):
    """The brass tie-on tag: the app's signature, so the deck looks like the thing."""
    from pptx.enum.shapes import MSO_SHAPE
    # No rotation: rotating the shape rotates its text with it, which printed every
    # label upside-down. PENTAGON already points the way a tag does.
    shp = s.shapes.add_shape(MSO_SHAPE.PENTAGON, Inches(0.7), Inches(top), Inches(3.6), Inches(0.62))
    shp.fill.solid(); shp.fill.fore_color.rgb = BRASS
    shp.line.fill.background()
    tf = shp.text_frame; tf.word_wrap = False
    p = tf.paragraphs[0]; p.text = label; p.alignment = PP_ALIGN.CENTER
    for r in p.runs:
        r.font.size = Pt(16); r.font.bold = True; r.font.color.rgb = INK; r.font.name = BODY
    return shp

def placeholder(s, left, top, width, height, caption):
    """Where a ChatGPT-generated image goes. Deliberately obvious, so an unfilled
       one is embarrassing rather than invisible."""
    from pptx.enum.shapes import MSO_SHAPE
    box = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(left), Inches(top), Inches(width), Inches(height))
    box.fill.solid(); box.fill.fore_color.rgb = PAPER
    box.line.color.rgb = BRASS; box.line.width = Pt(2.25)
    tf = box.text_frame; tf.word_wrap = True
    p = tf.paragraphs[0]; p.text = caption; p.alignment = PP_ALIGN.CENTER
    for r in p.runs:
        r.font.size = Pt(14); r.font.color.rgb = INK_SOFT; r.font.name = BODY; r.font.italic = True
    return box

def notes(s, txt):
    s.notes_slide.notes_text_frame.text = txt

# ----------------------------------------------------------------- 1. title
s = slide(INK)
text(s, "The Artefact Catalogue", 1.0, 2.5, 11.3, 1.5, size=54, colour=PAPER, font=DISPLAY)
text(s, "Cataloguing the collection, one object at a time", 1.0, 4.0, 11.3, 0.8,
     size=26, colour=BRASS, font=BODY)
text(s, "Don Dorrigo and Guy Fawkes Historical Society Museum", 1.0, 6.4, 11.3, 0.5,
     size=16, colour=RGBColor(0x9A, 0xA8, 0xB5), font=BODY)
notes(s, "Open by holding up the paper worksheet. Everyone recognises it. "
         "Say: this is the same form, on a phone, and it does the filing for you.")

# ----------------------------------------------------------------- 2. why
s = slide()
tag(s, "WHY WE BUILT IT")
text(s, "The paper form works.\nWhat comes after it doesn't.", 0.9, 1.5, 7.2, 2.4,
     size=36, font=DISPLAY)
text(s, "Someone fills in a two-page worksheet.\n"
        "Someone else types it up later.\n"
        "The photographs are on somebody's phone.\n"
        "The handwriting is not always clear.", 0.9, 4.0, 7.2, 2.6, size=23, colour=INK_SOFT)
placeholder(s, 8.4, 1.6, 4.2, 4.6, "IMAGE 1\nthe paper worksheet")
notes(s, "Nobody is being criticised here. The paper form is a good form. The problem "
         "is everything that happens to it afterwards: the second typing, the photographs "
         "that never quite get matched to the right object.")

# ----------------------------------------------------------------- 3. what it is
s = slide()
tag(s, "WHAT IT IS")
text(s, "The same questions.\nAsked one at a time.\nOn the phone in your hand.", 0.9, 1.8, 7.2, 2.6,
     size=38, font=DISPLAY)
text(s, "You stand in front of the object and answer.\n"
        "It writes the record for you.", 0.9, 4.8, 7.2, 1.4, size=26, colour=INK_SOFT)
placeholder(s, 8.4, 1.6, 4.2, 4.6, "IMAGE 2\nvolunteer with phone and object")
notes(s, "Emphasise: same questions, same wording as the paper form. Nothing new to learn. "
         "The review screen at the end even looks like the worksheet.")

# ----------------------------------------------------------------- 4. the flow
s = slide()
tag(s, "WHAT YOU DO")
text(s, "Ten screens. About ten minutes.", 0.9, 1.5, 11.5, 0.9, size=36, font=DISPLAY)
steps = [("1", "The number"), ("2", "Photographs"), ("3", "What is it?"), ("4", "Describe it"),
         ("5", "How big?"), ("6", "Condition"), ("7", "Who made it?"), ("8", "Its story"),
         ("9", "Where it lives"), ("10", "Check and save")]
from pptx.enum.shapes import MSO_SHAPE
for i, (n, label) in enumerate(steps):
    col, row = i % 5, i // 5
    x = 0.9 + col * 2.45
    y = 2.8 + row * 1.75
    c = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(x), Inches(y), Inches(0.72), Inches(0.72))
    c.fill.solid(); c.fill.fore_color.rgb = BRASS if row == 0 and col < 2 else INK
    c.line.fill.background()
    c.text_frame.word_wrap = False   # "10" wrapped to two lines inside the circle
    p = c.text_frame.paragraphs[0]; p.text = n; p.alignment = PP_ALIGN.CENTER
    for r in p.runs:
        r.font.size = Pt(18); r.font.bold = True; r.font.color.rgb = INK if (row == 0 and col < 2) else PAPER
    text(s, label, x - 0.05, y + 0.82, 2.3, 0.7, size=17, colour=INK_SOFT)
text(s, "The number comes first, so photographs can never be filed against the wrong object.",
     0.9, 6.3, 11.5, 0.7, size=20, colour=SAGE)
notes(s, "Walk through it slowly. The order is deliberate: the number first, then the camera. "
         "That is what stops a photograph ending up on the wrong record.")

# ----------------------------------------------------------------- 5. no signal
s = slide()
tag(s, "IN THE STORE ROOM")
text(s, "It works with no signal.", 0.9, 1.8, 7.4, 1.2, size=44, font=DISPLAY)
text(s, "The store room has no wifi. It doesn't need any.\n\n"
        "Everything is saved on the phone as you type it, and sent to the museum "
        "later, by itself, when you're back in range.", 0.9, 3.3, 7.4, 2.6, size=25, colour=INK_SOFT)
placeholder(s, 8.6, 1.8, 4.0, 4.2, "IMAGE 3\nstore room shelves")
notes(s, "This is the one people worry about. Be firm: you can catalogue all morning with "
         "no signal whatsoever and lose nothing.")

# ----------------------------------------------------------------- 6. nothing lost
s = slide(INK)
text(s, "Every word is saved\nthe moment you type it.", 1.1, 2.3, 11.0, 2.2, size=46,
     colour=PAPER, font=DISPLAY)
text(s, "If the phone rings, the battery dies, or you put it down until next Saturday —\n"
        "the record is exactly where you left it.", 1.1, 4.8, 11.0, 1.4, size=24, colour=BRASS)
notes(s, "No save button. There is deliberately no save button, because a save button is "
         "something you can forget to press.")

# ----------------------------------------------------------------- 7. blank is fine
s = slide()
tag(s, "THE MOST IMPORTANT RULE", top=0.45)
text(s, "If you don't know, leave it blank.", 0.9, 1.7, 11.5, 1.2, size=42, font=DISPLAY)
text(s, "A blank field is honest.", 0.9, 3.3, 5.4, 0.8, size=28, colour=SAGE, bold=True)
text(s, "A guess is a problem — because\nthe next person can't tell it apart\nfrom a fact.",
     0.9, 4.1, 5.4, 2.0, size=24, colour=INK_SOFT)
text(s, "\"About 1890\" is a\nproper answer.", 6.9, 3.3, 5.4, 1.6, size=28, colour=SAGE, bold=True)
text(s, "So is \"1920s\", and so is\n\"unknown\". The app will not\nmake you invent a date.",
     6.9, 4.7, 5.4, 2.0, size=24, colour=INK_SOFT)
notes(s, "Spend time here. Volunteers guess because they feel a blank looks like they "
         "haven't done the job. Tell them the opposite is true.")

# ----------------------------------------------------------------- 8. photographs
s = slide()
tag(s, "PHOTOGRAPHS")
text(s, "Take four.", 0.9, 1.6, 6.6, 1.0, size=42, font=DISPLAY)
text(s, "1.  The whole object\n2.  Maker's marks and labels\n3.  Any damage or repair\n"
        "4.  One with a ruler in shot", 0.9, 2.9, 6.6, 2.6, size=26)
text(s, "Someone in fifty years may never see this object.\nThey will see your photograph of it.",
     0.9, 5.7, 6.6, 1.2, size=21, colour=SAGE)
placeholder(s, 8.0, 1.6, 4.6, 4.8, "IMAGE 4\nfour views of one object")
notes(s, "Light from the side, not behind you. Never balance something fragile for a better "
         "angle — a worse photograph beats a broken artefact.")

# ----------------------------------------------------------------- 9. where it goes
s = slide()
tag(s, "WHERE YOUR WORK GOES")
text(s, "Three places, automatically.", 0.9, 1.5, 11.5, 0.9, size=36, font=DISPLAY)
stages = [("Your phone", "Saved as you type,\nwith or without signal.", BRASS),
          ("The museum", "Sent by itself when\nyou're back in range.", INK),
          ("eHive", "The museum's public\ncatalogue, worldwide.", SAGE)]
for i, (title, body, colour) in enumerate(stages):
    x = 0.9 + i * 4.15
    box = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(2.7), Inches(3.6), Inches(2.6))
    box.fill.solid(); box.fill.fore_color.rgb = PAPER
    box.line.color.rgb = colour; box.line.width = Pt(2.5)
    box.text_frame.text = ""
    text(s, title, x + 0.3, 3.0, 3.0, 0.7, size=26, colour=colour, bold=True, font=DISPLAY)
    text(s, body, x + 0.3, 3.8, 3.1, 1.4, size=19, colour=INK_SOFT)
    if i < 2:
        text(s, "→", x + 3.75, 3.7, 0.5, 0.6, size=30, colour=INK_SOFT)
text(s, "You don't have to do anything to make this happen.", 0.9, 5.8, 11.5, 0.7,
     size=22, colour=SAGE)
notes(s, "Nobody has to export anything, email anything or remember anything. "
         "The one thing to mention: sign in once on each device, or nothing is sent.")

# ----------------------------------------------------------------- 10. the catalogue
s = slide()
tag(s, "LOOKING THINGS UP")
text(s, "The whole collection,\nsearchable.", 0.9, 1.7, 7.0, 2.0, size=40, font=DISPLAY)
text(s, "Type a name, a number, a maker — anything.\n\n"
        "On a computer it opens straight to the catalogue.\n"
        "On a phone it opens ready to catalogue.", 0.9, 3.9, 7.0, 2.4, size=24, colour=INK_SOFT)
placeholder(s, 8.4, 1.7, 4.2, 4.4, "IMAGE 5\nsearch results on a laptop")
notes(s, "The app knows what device you are on. Phone means you are holding an object. "
         "Laptop means you are looking something up.")

# ----------------------------------------------------------------- 11. where we are
s = slide(INK)
text(s, "Where we are today", 1.0, 1.1, 11.3, 1.0, size=40, colour=PAPER, font=DISPLAY)
figures = [("38", "objects in the\ncatalogue"), ("91", "photographs\nattached"),
           ("66", "records held\nin eHive")]
for i, (n, label) in enumerate(figures):
    x = 1.0 + i * 3.9
    text(s, n, x, 2.6, 3.4, 1.6, size=76, colour=BRASS, font=DISPLAY)
    text(s, label, x, 4.3, 3.4, 1.4, size=21, colour=PAPER)
text(s, "Every object the museum already had in eHive is now in the app, with its photographs.",
     1.0, 6.1, 11.3, 0.8, size=20, colour=RGBColor(0x9A, 0xA8, 0xB5))
notes(s, "Update these numbers before presenting. They come from the catalogue's own screen.")

# ----------------------------------------------------------------- 12. donor details
s = slide()
tag(s, "SOMETHING WE DELIBERATELY LEFT OUT", top=0.45)
text(s, "The app never asks for donor details.", 0.9, 1.7, 11.5, 1.2, size=38, font=DISPLAY)
text(s, "No name. No address. No phone number. No email.", 0.9, 3.2, 11.5, 0.8,
     size=28, colour=ALERT, bold=True)
text(s, "Those are personal details about living people. They belong with the deed of gift, "
        "kept by the committee — not on a phone that gets passed around, and never in "
        "anything the app sends anywhere.\n\n"
        "If someone tells you donor details while you're cataloguing, pass them to the "
        "committee rather than typing them in.", 0.9, 4.2, 11.5, 2.4, size=23, colour=INK_SOFT)
notes(s, "Worth saying out loud even though the app enforces it. It reassures donors, and it "
         "tells volunteers the museum has thought about it.")

# ----------------------------------------------------------------- 13. getting started
s = slide()
tag(s, "GETTING STARTED")
text(s, "Three things, once.", 0.9, 1.5, 11.5, 0.9, size=38, font=DISPLAY)
starts = [("Add it to your Home Screen",
           "Open it in Safari, tap Share, then Add to Home Screen. Always open it from that icon."),
          ("Sign in",
           "Your email address, then a short code we send you. No password to remember."),
          ("Check the name at the top",
           "It should be yours. On a shared museum iPad, tap to change it before you start.")]
for i, (t, b) in enumerate(starts):
    y = 2.6 + i * 1.5
    c = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(0.9), Inches(y), Inches(0.6), Inches(0.6))
    c.fill.solid(); c.fill.fore_color.rgb = BRASS; c.line.fill.background()
    p = c.text_frame.paragraphs[0]; p.text = str(i + 1); p.alignment = PP_ALIGN.CENTER
    for r in p.runs:
        r.font.size = Pt(20); r.font.bold = True; r.font.color.rgb = INK
    text(s, t, 1.8, y - 0.05, 10.6, 0.6, size=26, bold=True)
    text(s, b, 1.8, y + 0.55, 10.6, 0.8, size=19, colour=INK_SOFT)
notes(s, "The Home Screen step matters most. An app opened in a Safari tab can have its "
         "records cleared by the iPhone after a week. From the Home Screen icon, it can't.")

# ----------------------------------------------------------------- 14. close
s = slide(INK)
text(s, "You can't break it.", 1.0, 2.4, 11.3, 1.2, size=52, colour=PAPER, font=DISPLAY)
text(s, "There is no wrong button. Nothing is deleted. Every earlier version is kept,\n"
        "and someone checks each record before it becomes part of the catalogue.\n\n"
        "If you're unsure, stop and ask. Nothing about cataloguing is urgent.",
     1.0, 4.0, 11.3, 2.2, size=24, colour=BRASS)
notes(s, "End here. The single biggest barrier is fear of doing damage. Say plainly that "
         "they cannot.")

prs.save("docs/artefact-catalogue-for-volunteers.pptx")
print(f"{len(prs.slides.__iter__.__self__._sldIdLst)} slides written")
